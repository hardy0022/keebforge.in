import "server-only";
import { cache } from "react";
import type { Prisma, OrderStatus, PaymentStatus, ReviewStatus, ReviewType, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Admin role hierarchy. Profile.role stays the source of truth. */
export const ADMIN_ROLES: Role[] = ["ADMIN", "STAFF"];

/** Terminal / non-active order statuses (used for pipeline + "active" counts). */
const TERMINAL: OrderStatus[] = ["DELIVERED", "ORDER_COMPLETED"];

const dayStart = (offsetDays = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
};

// ─── Dashboard ──────────────────────────────────────────────────────────────

export const getAdminStats = cache(async () => {
  const today = dayStart();
  const [todayOrders, todayRevenue, pendingOrders, pendingPayments, totalCustomers, activeProducts, lowStock] =
    await Promise.all([
      prisma.order.count({ where: { isDeleted: false, createdAt: { gte: today } } }),
      prisma.order.aggregate({
        where: { isDeleted: false, paymentStatus: "PAID", createdAt: { gte: today } },
        _sum: { total: true },
      }),
      prisma.order.count({ where: { isDeleted: false, status: "PAYMENT_PENDING" } }),
      prisma.order.count({ where: { isDeleted: false, paymentStatus: "PENDING" } }),
      prisma.profile.count(),
      prisma.product.count({ where: { active: true } }),
      prisma.product.count({
        where: { active: true, stock: { lte: prisma.product.fields.lowStockThreshold } },
      }),
    ]);

  const activeRepairs = await prisma.order.count({
    where: {
      isDeleted: false,
      type: "REPAIR",
      status: { notIn: [...TERMINAL, "COMPLETED"] },
    },
  });

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
  const from = dayStart(days - 1);
  const orders = await prisma.order.findMany({
    where: { isDeleted: false, paymentStatus: "PAID", createdAt: { gte: from } },
    select: { createdAt: true, total: true },
  });
  const buckets: { date: string; label: string; total: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = dayStart(days - 1 - i);
    buckets.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      total: 0,
    });
  }
  for (const o of orders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const b = buckets.find((x) => x.date === key);
    if (b) b.total += o.total;
  }
  return buckets;
});

/** Repair pipeline counts per stage, from orders carrying repair records. */
export const getRepairPipeline = cache(async () => {
  const rows = await prisma.order.findMany({
    where: { isDeleted: false, type: "REPAIR" },
    select: { status: true },
  });
  const stage: Record<string, number> = {};
  for (const r of rows) stage[r.status] = (stage[r.status] ?? 0) + 1;
  return stage;
});

export const getLowStockProducts = cache(async (take = 8) =>
  prisma.product.findMany({
    where: { active: true, stock: { lte: prisma.product.fields.lowStockThreshold } },
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
  })
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
  })
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
  })
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
};

export const getAdminOrders = cache((params: AdminOrdersQuery) => {
  const { q, status, payment, from, to, sort = "newest", page = 1, pageSize = 20 } = params;
  const where: Prisma.OrderWhereInput = {
    isDeleted: false,
    ...(q ? { OR: [{ orderNumber: { contains: q, mode: "insensitive" } }, { customerName: { contains: q, mode: "insensitive" } }, { customerEmail: { contains: q, mode: "insensitive" } }] } : {}),
    ...(status ? { status } : {}),
    ...(payment ? { paymentStatus: payment } : {}),
    ...(from || to ? { createdAt: { gte: from ? new Date(from) : undefined, lte: to ? new Date(`${to}T23:59:59`) : undefined } } : {}),
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
    prisma.order.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select }),
  ]).then(([total, items]) => ({ items, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) }));
});

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
  })
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

export const getAdminReviews = cache((params: AdminReviewsQuery) => {
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

  return Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select }),
  ]).then(async ([total, items]) => {
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
    const rows: AdminReviewRow[] = items.map((r) => ({ ...r, images: byReview.get(r.id) ?? [] }));
    return { items: rows, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
  });
});