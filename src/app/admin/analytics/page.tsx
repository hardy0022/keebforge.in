import Link from "next/link";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { formatINR } from "@/lib/money";
import { ORDER_BUCKET_LABELS, getAnalyticsKPIs, getAnalyticsSeries, getOrderStatusBreakdown, getWorkshopServices } from "@/lib/admin-analytics";
import { getRecentActivity, getRecentOrders } from "@/lib/admin";
import { ORDER_STATUS_LABELS } from "@/lib/orders";
import { RevenueOrdersChart } from "@/components/admin/RevenueOrdersChart";

export const metadata: Metadata = { title: "Analytics | KeebForge Admin", robots: { index: false, follow: false } };

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 0, label: "All time" },
];

function Delta({ value, suffix }: { value: number | null; suffix: string }) {
  if (value === null) return null;
  const up = value >= 0;
  return (
    <span style={{ fontSize: "0.68rem", color: up ? "var(--ok)" : "var(--err)" }}>
      {up ? "▲" : "▼"} {Math.abs(value)}% {suffix}
    </span>
  );
}

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requirePermission("order", "view");
  const { range } = await searchParams;
  const rangeDays = range === "0" ? 0 : Math.min(90, Math.max(7, Number(range) || 30));

  const [kpis, series, statusBreakdown, workshop, activity, recentOrders] = await Promise.all([
    getAnalyticsKPIs(rangeDays),
    getAnalyticsSeries(rangeDays),
    getOrderStatusBreakdown(),
    getWorkshopServices(rangeDays),
    getRecentActivity(8),
    getRecentOrders(8),
  ]);

  const maxRevenue = Math.max(1, ...series.map((b) => b.revenue));
  const maxOrders = Math.max(1, ...series.map((b) => b.orders));
  const revenueTotal = series.reduce((s, b) => s + b.revenue, 0);
  const ordersTotal = series.reduce((s, b) => s + b.orders, 0);
  const hasSeriesData = series.some((b) => b.revenue > 0 || b.orders > 0);
  const bucketTotal = Object.values(statusBreakdown).reduce((s, v) => s + v, 0);
  const bucketMax = Math.max(1, ...Object.values(statusBreakdown));
  const workshopMax = Math.max(1, ...workshop.map((w) => w.count));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Analytics
          </h1>
          <p className="muted" style={{ marginTop: 2 }}>
            Understand your store, workshop, orders and customer activity at a glance.
          </p>
        </div>
        <div className="seg">
          {RANGES.map((r) => (
            <Link
              key={r.label}
              href={`/admin/analytics?range=${r.days}`}
              style={{ padding: "5px 12px", borderRadius: 99, fontSize: "0.72rem", fontWeight: 700 }}
              className={r.days === rangeDays ? "active" : undefined}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="admin-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div className="admin-stat lime">
          <span>Revenue</span>
          <b>{formatINR(revenueTotal)}</b>
          <Delta value={kpis.revenueDelta} suffix="vs prev" />
        </div>
        <div className="admin-stat">
          <span>Orders</span>
          <b>{ordersTotal}</b>
          <Delta value={kpis.ordersDelta} suffix="vs prev" />
        </div>
        <div className="admin-stat">
          <span>New customers</span>
          <b>{kpis.newCustomers}</b>
          <Delta value={kpis.newCustomersDelta} suffix="vs prev" />
        </div>
        <div className="admin-stat purple">
          <span>Workshop active</span>
          <b>{kpis.activeWorkshop}</b>
          <div className="muted" style={{ fontSize: "0.68rem" }}>repair / service orders</div>
        </div>
      </div>

      <div className="admin-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ marginBottom: 0 }}>Revenue &amp; Orders</h3>
          <div style={{ display: "flex", gap: 14, fontSize: "0.7rem", color: "var(--t2)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 2, background: "var(--acc)" }} /> Revenue
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 2, background: "var(--purple)", borderTop: "1px dashed var(--purple)" }} /> Orders
            </span>
          </div>
        </div>
        {!hasSeriesData ? (
          <div className="empty" style={{ minHeight: 180 }}>
            <b>Not enough data yet</b>
            Revenue and order trends appear here as orders come in.
          </div>
        ) : (
          <RevenueOrdersChart data={series} maxRevenue={maxRevenue} maxOrders={maxOrders} />
        )}
      </div>

      <div className="admin-grid cols-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="admin-card">
          <h3>Order Status</h3>
          {bucketTotal === 0 ? (
            <div className="empty">
              <b>No orders yet</b>
              Orders will appear here by their current stage.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {Object.entries(ORDER_BUCKET_LABELS).map(([key, label]) => {
                const count = statusBreakdown[key] ?? 0;
                return (
                  <div key={key}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: "0.78rem" }}>
                      <span style={{ color: "var(--t2)" }}>{label}</span>
                      <b className="num">{count}</b>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: "var(--bg3)", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${(count / bucketMax) * 100}%`,
                          background: "linear-gradient(90deg, var(--acc), rgba(201,243,29,0.4))",
                          borderRadius: 99,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="admin-card">
          <h3>Workshop Services</h3>
          {workshop.length === 0 ? (
            <div className="empty">
              <b>No workshop data yet</b>
              Most-requested services appear here once workshop orders are placed.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {workshop.map((w) => (
                <div key={w.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: "0.78rem" }}>
                    <span style={{ color: "var(--t2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {w.name}
                    </span>
                    <b className="num" style={{ flexShrink: 0, marginLeft: 8 }}>{w.count}</b>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: "var(--bg3)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${(w.count / workshopMax) * 100}%`,
                        background: "linear-gradient(90deg, var(--purple), rgba(124,111,242,0.4))",
                        borderRadius: 99,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="admin-card">
        <h3>Recent Activity</h3>
        {activity.length === 0 && recentOrders.length === 0 ? (
          <div className="empty">
            <b>Not enough data yet</b>
            Analytics will appear here as orders, customers and workshop activity come in.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/admin/orders/${o.orderNumber}`} style={{ color: "var(--acc)", fontWeight: 600 }}>
                        {o.orderNumber}
                      </Link>
                      <span className="muted" style={{ marginLeft: 6 }}>order placed</span>
                    </td>
                    <td style={{ color: "var(--t2)" }}>{o.customerName}</td>
                    <td><span className="badge">{ORDER_STATUS_LABELS[o.status]}</span></td>
                    <td className="muted num">{o.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  </tr>
                ))}
                {activity
                  .filter((a) => !recentOrders.some((o) => o.orderNumber === a.order.orderNumber))
                  .map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link href={`/admin/orders/${a.order.orderNumber}`} style={{ color: "var(--acc)", fontWeight: 600 }}>
                          {a.order.orderNumber}
                        </Link>
                        <span className="muted" style={{ marginLeft: 6 }}>status change</span>
                      </td>
                      <td className="muted">—</td>
                      <td><span className="badge">{ORDER_STATUS_LABELS[a.status]}</span></td>
                      <td className="muted num">{a.createdAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
