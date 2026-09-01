import Link from "next/link";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { formatINR } from "@/lib/money";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from "@/lib/orders";
import { getAdminOrders } from "@/lib/admin";

export const metadata: Metadata = {
  title: "Orders | KeebForge Admin",
  robots: { index: false, follow: false },
};

const ORDER_STATUSES = Object.entries(ORDER_STATUS_LABELS) as [string, string][];
const PAYMENT_STATUSES = ["PENDING", "PARTIALLY_PAID", "PAID", "FAILED", "REFUNDED"] as const;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; payment?: string; from?: string; to?: string; sort?: string; page?: string }>;
}) {
  await requirePermission("order", "view");
  const sp = await searchParams;
  const result = await getAdminOrders({
    q: sp.q,
    status: sp.status as never,
    payment: sp.payment as never,
    from: sp.from,
    to: sp.to,
    sort: (sp.sort as never) || "newest",
    page: Math.max(1, Number(sp.page) || 1),
    excludeCompleted: true,
  });

  const link = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    if (sp.q) p.set("q", sp.q);
    if (sp.status) p.set("status", sp.status);
    if (sp.payment) p.set("payment", sp.payment);
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    if (sp.sort) p.set("sort", sp.sort);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `/admin/orders?${s}` : "/admin/orders";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          Orders <span className="muted num">({result.total})</span>
        </h1>
      </div>

      <form method="get" action="/admin/orders" style={{ display: "flex", flexWrap: "wrap", gap: 10 }} className="admin-card">
        <input className="input" name="q" defaultValue={sp.q} placeholder="Search order #, name or email" style={{ flex: "1 1 200px" }} />
        <select className="select" name="status" defaultValue={sp.status ?? ""} style={{ flex: "0 1 170px" }}>
          <option value="">All statuses</option>
          {ORDER_STATUSES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select className="select" name="payment" defaultValue={sp.payment ?? ""} style={{ flex: "0 1 140px" }}>
          <option value="">All payments</option>
          {PAYMENT_STATUSES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input className="input" type="date" name="from" defaultValue={sp.from} style={{ flex: "0 1 150px" }} />
        <input className="input" type="date" name="to" defaultValue={sp.to} style={{ flex: "0 1 150px" }} />
        <select className="select" name="sort" defaultValue={sp.sort ?? "newest"} style={{ flex: "0 1 150px" }}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="amount-desc">Highest amount</option>
          <option value="amount-asc">Lowest amount</option>
        </select>
        <div className="admin-actions" style={{ marginLeft: "auto" }}>
          <button type="submit" className="btn-admin primary">
            Filter
          </button>
          {Object.keys(sp).length > 0 && (
            <Link href="/admin/orders" className="btn-admin">
              Clear
            </Link>
          )}
        </div>
      </form>

      {result.items.length === 0 ? (
        <div className="empty">
          <b>No orders match</b>
          Try widening the filters — or new orders will appear here after checkout is live.
        </div>
      ) : (
        <div className="admin-card" style={{ padding: 8 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/admin/orders/${o.orderNumber}`} style={{ color: "var(--acc)", fontWeight: 600 }}>
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>{o.customerName}</div>
                      <div className="muted num" style={{ fontSize: "0.7rem" }}>
                        {o.customerEmail}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-purple">{ORDER_TYPE_LABELS[o.type]}</span>
                    </td>
                    <td>
                      <span className="badge">{ORDER_STATUS_LABELS[o.status]}</span>
                    </td>
                    <td>
                      <span className={`badge ${o.paymentStatus === "PAID" ? "badge-ok" : o.paymentStatus === "FAILED" ? "badge-err" : "badge-warn"}`}>
                        {o.paymentStatus}
                      </span>
                    </td>
                    <td className="num muted">{o._count.items + o._count.services + o._count.repairs}</td>
                    <td className="num">{formatINR(o.total)}</td>
                    <td className="muted num">{o.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result.pages > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center" }}>
          <Link className="btn-admin sm" href={link({ page: result.page - 1 })} style={result.page <= 1 ? { pointerEvents: "none", opacity: 0.4 } : undefined}>
            ← Prev
          </Link>
          <span className="muted num">
            Page {result.page} of {result.pages}
          </span>
          <Link className="btn-admin sm" href={link({ page: result.page + 1 })} style={result.page >= result.pages ? { pointerEvents: "none", opacity: 0.4 } : undefined}>
            Next →
          </Link>
        </div>
      )}
    </div>
  );
}