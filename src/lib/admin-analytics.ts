import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { daysAgoISTDayStart, fmtIST, istDayKey } from "@/lib/ist";
import { revenueTime } from "@/lib/admin";

/** Human buckets mapping the 18-status pipeline to a compact analytics view. */
export const ORDER_BUCKET_LABELS: Record<string, string> = {
  placed: "Placed",
  inWorkshop: "In Workshop",
  qualityCheck: "Quality Check",
  shipped: "Shipped",
  delivered: "Delivered",
};

const STATUS_BUCKETS: Record<string, string[]> = {
  placed: ["ORDER_RECEIVED", "ORDER_CONFIRMED", "PAYMENT_PENDING", "PAYMENT_RECEIVED"],
  inWorkshop: ["PARTS_BOOKED", "PARTS_SHIPPED", "PARTS_RECEIVED", "IN_QUEUE", "WORK_STARTED", "COMPLETED"],
  qualityCheck: ["TESTING"],
  shipped: ["PACKING", "SHIPMENT_BOOKED", "SHIPMENT_PICKED_UP", "IN_TRANSIT"],
  delivered: ["DELIVERED", "ORDER_COMPLETED", "TESTING_WARRANTY_ACTIVE"],
};

// ─── KPIs ──────────────────────────────────────────────────────────────────

export const getAnalyticsKPIs = cache(async (rangeDays: number) => {
  const allTime = rangeDays <= 0;
  const from = allTime ? undefined : daysAgoISTDayStart(rangeDays - 1);
  const prevFrom = allTime ? undefined : daysAgoISTDayStart(rangeDays * 2 - 1);
  const prevTo = allTime ? undefined : daysAgoISTDayStart(rangeDays - 1);
  const timeFilter = (gte: Date | undefined, lt?: Date) => ({
    ...(gte ? { gte } : {}),
    ...(lt ? { lt } : {}),
  });

  const [revenue, prevRevenue, orders, prevOrders, newCustomers, prevNewCustomers, activeWorkshop] =
    await Promise.all([
      prisma.order.aggregate({
        where: { isDeleted: false, paymentStatus: "PAID", ...(from ? { createdAt: { gte: from } } : {}) },
        _sum: { total: true },
      }),
      prisma.order.aggregate({
        where: { isDeleted: false, paymentStatus: "PAID", createdAt: timeFilter(prevFrom, prevTo) },
        _sum: { total: true },
      }),
      prisma.order.count({ where: { isDeleted: false, ...(from ? { createdAt: { gte: from } } : {}) } }),
      prisma.order.count({ where: { isDeleted: false, createdAt: timeFilter(prevFrom, prevTo) } }),
      prisma.profile.count({ where: { role: "CUSTOMER", ...(from ? { createdAt: { gte: from } } : {}) } }),
      prisma.profile.count({ where: { role: "CUSTOMER", createdAt: timeFilter(prevFrom, prevTo) } }),
      prisma.order.count({
        where: {
          isDeleted: false,
          status: { in: ["IN_QUEUE", "WORK_STARTED", "TESTING", "COMPLETED", "PARTS_BOOKED", "PARTS_RECEIVED"] },
        },
      }),
    ]);

  const pct = (cur: number, prev: number) => (allTime || prev <= 0 ? null : Math.round(((cur - prev) / prev) * 100));

  return {
    revenue: revenue._sum.total ?? 0,
    revenueDelta: pct(revenue._sum.total ?? 0, prevRevenue._sum.total ?? 0),
    orders,
    ordersDelta: pct(orders, prevOrders),
    newCustomers,
    newCustomersDelta: pct(newCustomers, prevNewCustomers),
    activeWorkshop,
  };
});

// ─── Revenue + order time series ───────────────────────────────────────────

export const getAnalyticsSeries = cache(async (rangeDays: number) => {
  const days = rangeDays > 0 ? rangeDays : 365;
  const from = daysAgoISTDayStart(days - 1);
  const orders = await prisma.order.findMany({
    where: { isDeleted: false, paymentStatus: "PAID", createdAt: { gte: from } },
    select: {
      createdAt: true,
      total: true,
      payments: { where: { status: "PAID" }, select: { status: true, paidAt: true } },
    },
  });
  const series: { date: string; label: string; revenue: number; orders: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = daysAgoISTDayStart(i);
    series.push({
      date: istDayKey(d),
      label: fmtIST(d, { day: "numeric", month: "short" }),
      revenue: 0,
      orders: 0,
    });
  }
  const bucketByKey = new Map(series.map((b) => [b.date, b]));
  for (const o of orders) {
    const b = bucketByKey.get(istDayKey(revenueTime(o)));
    if (b) {
      b.revenue += o.total;
      b.orders += 1;
    }
  }
  return series;
});

// ─── Order status breakdown ────────────────────────────────────────────────

export const getOrderStatusBreakdown = cache(async () => {
  const rows = await prisma.order.findMany({
    where: { isDeleted: false },
    select: { status: true },
  });
  const buckets: Record<string, number> = { placed: 0, inWorkshop: 0, qualityCheck: 0, shipped: 0, delivered: 0 };
  for (const r of rows) {
    for (const [key, statuses] of Object.entries(STATUS_BUCKETS)) {
      if (statuses.includes(r.status)) {
        buckets[key] += 1;
        break;
      }
    }
  }
  return buckets;
});

// ─── Workshop mods (most requested) ────────────────────────────────────────

export const getWorkshopMods = cache(async (rangeDays: number, take = 6) => {
  const from = rangeDays > 0 ? daysAgoISTDayStart(rangeDays - 1) : undefined;
  const rows = await prisma.orderService.findMany({
    where: { ...(from ? { createdAt: { gte: from } } : {}) },
    select: { lineTotal: true, service: { select: { group: { select: { name: true } } } } },
  });
  const byGroup: Record<string, { count: number; revenue: number }> = {};
  for (const r of rows) {
    const name = r.service?.group?.name ?? "Other";
    const g = (byGroup[name] ??= { count: 0, revenue: 0 });
    g.count += 1;
    g.revenue += r.lineTotal;
  }
  return Object.entries(byGroup)
    .map(([name, g]) => ({ name, count: g.count, revenue: g.revenue }))
    .sort((a, b) => b.count - a.count)
    .slice(0, take);
});
