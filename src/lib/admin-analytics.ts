import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const dayStart = (offsetDays = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
};

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
  const from = allTime ? undefined : dayStart(rangeDays - 1);
  const prevFrom = allTime ? undefined : dayStart(rangeDays * 2 - 1);
  const prevTo = allTime ? undefined : dayStart(rangeDays - 1);
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
  const from = dayStart(days - 1);
  const orders = await prisma.order.findMany({
    where: { isDeleted: false, paymentStatus: "PAID", createdAt: { gte: from } },
    select: { createdAt: true, total: true },
  });
  const series: { date: string; label: string; revenue: number; orders: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dayStart(i);
    series.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      revenue: 0,
      orders: 0,
    });
  }
  for (const o of orders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const b = series.find((x) => x.date === key);
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
  const from = rangeDays > 0 ? dayStart(rangeDays - 1) : undefined;
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
