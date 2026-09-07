import "server-only";
import { cache } from "react";
import type {
  Prisma,
  OrderStatus,
  PaymentStatus,
  ReviewStatus,
  ReviewType,
  ShippingStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { defineCached, TAG, TTL } from "@/lib/caching/cache";

import {
  fmtIST,
  istDayEnd,
  istDayKey,
  istDayStart,
  startOfTodayIST,
  endOfTodayIST,
  daysAgoISTDayStart,
} from "@/lib/ist";

/** Terminal / non-active order statuses (used for pipeline + "active" counts). */
const TERMINAL: OrderStatus[] = ["DELIVERED", "ORDER_COMPLETED"];

/** Revenue timestamp for a paid order: the actual capture, else order creation. */
export const revenueTime = (o: {
  createdAt: Date;
  payments?: { status: PaymentStatus; paidAt: Date | null }[] | null;
}) => {
  const captured = (o.payments ?? [])
    .filter((p) => p.status === "PAID" && p.paidAt)
    .map((p) => p.paidAt as Date)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return captured ?? o.createdAt;
};

// ─── Dashboard ──────────────────────────────────────────────────────────────

export const getAdminStats = cache(async () => {
  const [startToday, endToday] = [startOfTodayIST(), endOfTodayIST()];
  const [
    todayOrders,
    todayRevenue,
    pendingOrders,
    pendingPayments,
    totalCustomers,
    activeProducts,
    lowStock,
    activeRepairs,
  ] = await Promise.all([
    prisma.order.count({
      where: { isDeleted: false, createdAt: { gte: startToday, lt: endToday } },
    }),
    prisma.order.aggregate({
      where: {
        isDeleted: false,
        paymentStatus: "PAID",
        createdAt: { gte: startToday, lt: endToday },
      },
      _sum: { total: true },
    }),
    prisma.order.count({
      where: { isDeleted: false, status: "PAYMENT_PENDING" },
    }),
    prisma.order.count({
      where: { isDeleted: false, paymentStatus: "PENDING" },
    }),
    prisma.profile.count(),
    prisma.product.count({ where: { active: true } }),
    prisma.product.count({
      where: {
        active: true,
        stock: { lte: prisma.product.fields.lowStockThreshold },
      },
    }),
    prisma.order.count({
      where: {
        isDeleted: false,
        type: "REPAIR",
        status: { notIn: [...TERMINAL, "COMPLETED"] },
      },
    }),
  ]);

  return {
    todayOrders,
    todayRevenue: todayRevenue._sum.total ?? 0,
    pendingOrders,
    pendingPayments,
    activeRepairs,
    totalCustomers,
    activeProducts,
    lowStock,
  };
});

/** Daily revenue (PAID orders) for the trailing N days, oldest first. */
export const getRevenueSeries = cache(async (days: number) => {
  const from = daysAgoISTDayStart(days - 1);
  const orders = await prisma.order.findMany({
    where: {
      isDeleted: false,
      paymentStatus: "PAID",
      createdAt: { gte: from },
    },
    select: {
      createdAt: true,
      total: true,
      payments: {
        where: { status: "PAID" },
        select: { status: true, paidAt: true },
      },
    },
  });
  const buckets: { date: string; label: string; total: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = daysAgoISTDayStart(days - 1 - i);
    buckets.push({
      date: istDayKey(d),
      label: fmtIST(d, { day: "numeric", month: "short" }),
      total: 0,
    });
  }
  const bucketByKey = new Map(buckets.map((b) => [b.date, b]));
  for (const o of orders) {
    const key = istDayKey(revenueTime(o));
    const b = bucketByKey.get(key);
    if (b) b.total += o.total;
  }
  return buckets;
});

/** Repair pipeline counts per stage, from orders carrying repair records. */
export const getRepairPipeline = cache(async () => {
  const grouped = await prisma.order.groupBy({
    by: ["status"],
    where: { isDeleted: false, type: "REPAIR" },
    _count: { _all: true },
  });
  const stage: Record<string, number> = {};
  for (const g of grouped) stage[g.status] = g._count._all;
  return stage;
});

export const getLowStockProducts = cache(async (take = 8) =>
  prisma.product.findMany({
    where: {
      active: true,
      stock: { lte: prisma.product.fields.lowStockThreshold },
    },
    orderBy: { stock: "asc" },
    take,
    select: {
      id: true,
      name: true,
      slug: true,
      stock: true,
      reservedQuantity: true,
      lowStockThreshold: true,
      category: { select: { name: true } },
    },
  }),
);

export const getRecentOrders = cache(async (take = 8) =>
  prisma.order.findMany({
    where: { isDeleted: false },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      type: true,
      status: true,
      paymentStatus: true,
      total: true,
      createdAt: true,
    },
  }),
);

export const getRecentActivity = cache(async (take = 10) =>
  prisma.orderTimeline.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      note: true,
      createdAt: true,
      order: { select: { orderNumber: true } },
    },
  }),
);

// ─── Orders list ────────────────────────────────────────────────────────────

export type AdminOrdersQuery = {
  q?: string;
  status?: OrderStatus;
  payment?: PaymentStatus;
  from?: string;
  to?: string;
  sort?: "newest" | "oldest" | "amount-desc" | "amount-asc";
  page?: number;
  pageSize?: number;
  /** completed only, or excludeCompleted to hide them */
  completed?: boolean;
  excludeCompleted?: boolean;
};

/** Statuses treated as a finished/completed order. */
export const COMPLETED_STATUSES: OrderStatus[] = [
  "DELIVERED",
  "ORDER_COMPLETED",
];

export const getAdminOrders = cache((params: AdminOrdersQuery) => {
  const {
    q,
    status,
    payment,
    from,
    to,
    sort = "newest",
    page = 1,
    pageSize = 20,
    completed,
    excludeCompleted,
  } = params;
  const statusFilter = completed
    ? { status: { in: COMPLETED_STATUSES } }
    : excludeCompleted
      ? { status: { notIn: COMPLETED_STATUSES } }
      : status
        ? { status }
        : {};
  const where: Prisma.OrderWhereInput = {
    isDeleted: false,
    ...statusFilter,
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q, mode: "insensitive" } },
            { customerName: { contains: q, mode: "insensitive" } },
            { customerEmail: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(payment ? { paymentStatus: payment } : {}),
    ...(from || to
      ? {
          createdAt: {
            gte: from ? istDayStart(from) : undefined,
            lte: to ? istDayEnd(to) : undefined,
          },
        }
      : {}),
  };
  const orderBy =
    sort === "oldest"
      ? { createdAt: "asc" as const }
      : sort === "amount-desc"
        ? { total: "desc" as const }
        : sort === "amount-asc"
          ? { total: "asc" as const }
          : { createdAt: "desc" as const };

  const select = {
    id: true,
    orderNumber: true,
    customerName: true,
    customerEmail: true,
    type: true,
    status: true,
    paymentStatus: true,
    total: true,
    createdAt: true,
    _count: { select: { items: true, services: true, repairs: true } },
  } satisfies Prisma.OrderSelect;

  return Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select,
    }),
  ]).then(([total, items]) => ({
    items,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  }));
});

// ─── Shipments (admin) ────────────────────────────────────────────────────

/** Shipment rows with their order context, newest first. Admin-only.
 *  Delivered and returned are hidden unless a status is explicitly asked for. */
export const getAdminShipments = cache(
  ({ q, status }: { q?: string; status?: ShippingStatus }) =>
    prisma.shipment.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { trackingNumber: { contains: q, mode: "insensitive" } },
                { courier: { contains: q, mode: "insensitive" } },
                {
                  order: {
                    orderNumber: { contains: q, mode: "insensitive" },
                  },
                },
                {
                  order: { customerName: { contains: q, mode: "insensitive" } },
                },
              ],
            }
          : {}),
        ...(status
          ? { status }
          : {
              status: { notIn: ["DELIVERED", "RETURNED"] as ShippingStatus[] },
            }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        order: {
          select: {
            orderNumber: true,
            customerName: true,
            customerEmail: true,
            total: true,
            shippingDestinationPincode: true,
          },
        },
      },
    }),
);

// ─── Order detail ───────────────────────────────────────────────────────────

export const getAdminOrder = cache((orderNumber: string) =>
  prisma.order.findFirst({
    where: { orderNumber, isDeleted: false },
    include: {
      shippingAddress: true,
      items: { orderBy: { createdAt: "asc" } },
      services: { orderBy: { createdAt: "asc" } },
      repairs: true,
      payments: { orderBy: { createdAt: "desc" } },
      shipment: true,
      timeline: { orderBy: { createdAt: "asc" } },
      messages: { orderBy: { createdAt: "asc" } },
      warranty: true,
      profile: { select: { id: true, email: true, phone: true, name: true } },
    },
  }),
);

// ─── Reviews (moderation) ───────────────────────────────────────────────────

export type AdminReviewsQuery = {
  status?: ReviewStatus;
  type?: ReviewType;
  rating?: number;
  q?: string;
  page?: number;
  pageSize?: number;
};

export type AdminReviewRow = Prisma.ReviewGetPayload<{
  select: {
    id: true;
    rating: true;
    title: true;
    body: true;
    authorName: true;
    verified: true;
    status: true;
    type: true;
    serviceLabel: true;
    createdAt: true;
    productNameSnapshot: true;
    productSlugSnapshot: true;
    profile: { select: { id: true; name: true; email: true } };
    product: { select: { id: true; name: true; slug: true; active: true } };
  };
}> & { images: { url: string }[] };

const adminReviewsPage = cache(async (params: AdminReviewsQuery) => {
  const { status, type, rating, q, page = 1, pageSize = 20 } = params;
  const where: Prisma.ReviewWhereInput = {
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(rating ? { rating } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { body: { contains: q, mode: "insensitive" } },
            { authorName: { contains: q, mode: "insensitive" } },
            { productNameSnapshot: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const select = {
    id: true,
    rating: true,
    title: true,
    body: true,
    authorName: true,
    verified: true,
    status: true,
    type: true,
    serviceLabel: true,
    createdAt: true,
    productNameSnapshot: true,
    productSlugSnapshot: true,
    profile: { select: { id: true, name: true, email: true } },
    product: { select: { id: true, name: true, slug: true, active: true } },
  } satisfies Prisma.ReviewSelect;

  const pageResults = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select,
    }),
  ]);
  const [total, items] = pageResults;
  const media = await prisma.media.findMany({
    where: { entityType: "REVIEW", entityId: { in: items.map((r) => r.id) } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const byReview = new Map<string, { url: string }[]>();
  for (const m of media) {
    const list = byReview.get(m.entityId) ?? [];
    list.push({ url: m.secureUrl });
    byReview.set(m.entityId, list);
  }
  const rows: AdminReviewRow[] = items.map((r) => ({
    ...r,
    images: byReview.get(r.id) ?? [],
  }));
  return {
    items: rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
});

const cachedAdminReviews = defineCached(adminReviewsPage, {
  tags: [TAG.reviews],
  revalidate: TTL.reviews,
  keys: ["admin-reviews"],
});

export function getAdminReviews(params: AdminReviewsQuery) {
  // Search text is unbounded user input — route it around the persistent
  // cache (same rule as the public shop search); moderation status/type/rating
  // filters stay cache-keyed because admin actions invalidate on every change.
  return params.q ? adminReviewsPage(params) : cachedAdminReviews(params);
}
