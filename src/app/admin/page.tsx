import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { formatINR } from "@/lib/money";
import { ORDER_STATUS_LABELS } from "@/lib/orders";
import {
  getAdminStats,
  getRevenueSeries,
  getRepairPipeline,
  getLowStockProducts,
  getRecentOrders,
  getRecentActivity,
} from "@/lib/admin";
import { getTopProducts } from "@/lib/admin-catalog";

export const metadata: Metadata = {
  title: "Dashboard | KeebForge Admin",
  robots: { index: false, follow: false },
};

const RANGES = [
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 365, label: "1y" },
];

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireAdmin();
  const { range } = await searchParams;
  const rangeDays = Math.max(7, Math.min(365, Number(range) || 7));
  const [stats, revenue, pipeline, lowStock, recentOrders, activity, topProducts] = await Promise.all([
    getAdminStats(),
    getRevenueSeries(rangeDays),
    getRepairPipeline(),
    getLowStockProducts(),
    getRecentOrders(),
    getRecentActivity(),
    getTopProducts(5),
  ]);

  const maxTotal = Math.max(1, ...revenue.map((b) => b.total));
  const pipeEntries = Object.entries(pipeline).sort((a, b) => b[1] - a[1]);
  const pipeTotal = pipeEntries.reduce((s, [, n]) => s + n, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          Dashboard
        </h1>
      </div>

      <div className="admin-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <div className="admin-stat lime">
          <span>Today&apos;s revenue</span>
          <b>{formatINR(stats.todayRevenue)}</b>
        </div>
        <div className="admin-stat">
          <span>Today&apos;s orders</span>
          <b>{stats.todayOrders}</b>
        </div>
        <div className="admin-stat warn">
          <span>Pending orders</span>
          <b>{stats.pendingOrders}</b>
        </div>
        <div className="admin-stat warn">
          <span>Pending payments</span>
          <b>{stats.pendingPayments}</b>
        </div>
        <div className="admin-stat purple">
          <span>Active repairs</span>
          <b>{stats.activeRepairs}</b>
        </div>
        <div className="admin-stat">
          <span>Customers</span>
          <b>{stats.totalCustomers}</b>
        </div>
        <div className="admin-stat">
          <span>Products</span>
          <b>{stats.activeProducts}</b>
        </div>
        <div className={`admin-stat ${stats.lowStock > 0 ? "err" : "ok"}`}>
          <span>Low stock</span>
          <b>{stats.lowStock}</b>
        </div>
      </div>

      <div className="admin-grid cols-2" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="admin-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h3 style={{ marginBottom: 0 }}>Revenue — paid orders</h3>
            <div className="seg">
              {RANGES.map((r) => (
                <Link
                  key={r.days}
                  href={`/admin?range=${r.days}`}
                  style={{ padding: "5px 12px", borderRadius: 99, fontSize: "0.72rem", fontWeight: 700 }}
                  className={r.days === rangeDays ? "active" : undefined}
                >
                  {r.label}
                </Link>
              ))}
            </div>
          </div>
          {revenue.every((b) => b.total === 0) ? (
            <div className="empty">
              <b>No paid orders yet</b>
              Revenue for this window shows here once orders are paid.
            </div>
          ) : (
            <>
              <div className="chart-bars">
                {revenue.map((b) => (
                  <div
                    key={b.date}
                    className="chart-bar"
                    style={{ height: `${Math.max(2, (b.total / maxTotal) * 100)}%` }}
                    data-label={`${b.label} · ${formatINR(b.total)}`}
                  />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }} className="muted">
                <span>{revenue[0]?.label}</span>
                <span>{revenue[revenue.length - 1]?.label}</span>
              </div>
            </>
          )}
        </div>

        <div className="admin-card">
          <h3>Repair pipeline</h3>
          {pipeTotal === 0 ? (
            <div className="empty">
              <b>No repairs yet</b>
              Repair orders appear here by stage.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pipeEntries.map(([status, count]) => (
                <div key={status} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <span className="badge">{ORDER_STATUS_LABELS[status as keyof typeof ORDER_STATUS_LABELS] ?? status}</span>
                  <b className="num">{count}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="admin-grid cols-2" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="admin-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <h3 style={{ marginBottom: 0 }}>Recent orders</h3>
            <Link href="/admin/orders" className="muted" style={{ fontSize: "0.75rem" }}>
              View all →
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className="empty">
              <b>No orders yet</b>
              New orders from checkout land here.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Total</th>
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
                      </td>
                      <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o.customerName}
                      </td>
                      <td>
                        <span className="badge">{ORDER_STATUS_LABELS[o.status]}</span>
                      </td>
                      <td className="num">{formatINR(o.total)}</td>
                      <td className="muted num">{o.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="admin-grid" style={{ gridTemplateColumns: "1fr", gap: 16 }}>
          <div className="admin-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h3 style={{ marginBottom: 0 }}>Top products</h3>
              <Link href="/admin/products" className="muted" style={{ fontSize: "0.75rem" }}>
                Manage →
              </Link>
            </div>
            {topProducts.length === 0 ? (
              <div className="empty">
                <b>No sales yet</b>
                Best sellers appear here once orders are placed.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {topProducts.map((p, i) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      <span className="muted num">{i + 1}.</span>{" "}
                      <Link href={`/admin/products/${p.id}`} style={{ color: "inherit" }}>{p.name}</Link>
                    </span>
                    <span className="num muted" style={{ flexShrink: 0 }}>{p.units} × {formatINR(p.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="admin-card">
            <h3>Low stock</h3>
            {lowStock.length === 0 ? (
              <div className="empty">
                <b>All stocked</b>
                Nothing below its low-stock threshold.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lowStock.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}
                    </span>
                    <span className={`badge ${p.stock === 0 ? "badge-err" : "badge-warn"}`} style={{ flexShrink: 0 }}>
                      {p.stock} left
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="admin-card">
            <h3>Recent activity</h3>
            {activity.length === 0 ? (
              <div className="empty">
                <b>Quiet</b>
                Status changes and timeline notes appear here.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {activity.map((a) => (
                  <div key={a.id} style={{ fontSize: "0.78rem" }}>
                    <Link href={`/admin/orders/${a.order.orderNumber}`} style={{ color: "var(--acc)", fontWeight: 600 }}>
                      {a.order.orderNumber}
                    </Link>{" "}
                    <span style={{ color: "var(--t2)" }}>→ {ORDER_STATUS_LABELS[a.status]}</span>
                    <div className="muted num">{a.createdAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
