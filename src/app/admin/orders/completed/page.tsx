import Link from "next/link";
import type { Metadata } from "next";
import type { PaymentStatus } from "@prisma/client";
import { requirePermission } from "@/lib/auth/admin";
import { formatINR } from "@/lib/utils/money";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from "@/lib/orders";
import { getAdminOrders, COMPLETED_STATUSES } from "@/lib/admin";
import { fmtIST } from "@/lib/utils/ist";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { parsePage } from "@/lib/admin/pagination";

export const metadata: Metadata = {
  title: "Completed Orders | KeebForge Admin",
  robots: { index: false, follow: false },
};

const PAYMENT_STATUSES = [
  "PENDING",
  "PARTIALLY_PAID",
  "PAID",
  "FAILED",
  "REFUNDED",
] as const;

export default async function AdminCompletedOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    payment?: string;
    from?: string;
    to?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  await requirePermission("order", "view");
  const sp = await searchParams;
  const result = await getAdminOrders({
    q: sp.q,
    payment: PAYMENT_STATUSES.includes(sp.payment as never)
      ? (sp.payment as PaymentStatus)
      : undefined,
    from: sp.from,
    to: sp.to,
    sort: (sp.sort as never) || "newest",
    page: parsePage(sp.page),
    completed: true,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h1
          style={{
            fontFamily: "var(--ff-display)",
            fontSize: "1.35rem",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Completed Orders <span className="muted num">({result.total})</span>
        </h1>
      </div>

      <form
        method="get"
        action="/admin/orders/completed"
        style={{ display: "flex", flexWrap: "wrap", gap: 10 }}
        className="admin-card"
      >
        <input
          className="input"
          name="q"
          defaultValue={sp.q}
          placeholder="Search order #, name or email"
          style={{ flex: "1 1 200px" }}
        />
        <select
          className="select"
          name="payment"
          defaultValue={sp.payment ?? ""}
          style={{ flex: "0 1 140px" }}
        >
          <option value="">All payments</option>
          {PAYMENT_STATUSES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          className="input"
          type="date"
          name="from"
          defaultValue={sp.from}
          style={{ flex: "0 1 150px" }}
        />
        <input
          className="input"
          type="date"
          name="to"
          defaultValue={sp.to}
          style={{ flex: "0 1 150px" }}
        />
        <select
          className="select"
          name="sort"
          defaultValue={sp.sort ?? "newest"}
          style={{ flex: "0 1 150px" }}
        >
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
            <Link href="/admin/orders/completed" className="btn-admin">
              Clear
            </Link>
          )}
        </div>
      </form>

      {result.items.length === 0 ? (
        <div className="empty">
          <b>No completed orders</b>
          Orders with{" "}
          {COMPLETED_STATUSES.map((s) => ORDER_STATUS_LABELS[s]).join(
            " or ",
          )}{" "}
          status will appear here.
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
                      <Link
                        href={`/admin/orders/${o.orderNumber}`}
                        style={{ color: "var(--acc)", fontWeight: 600 }}
                      >
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                        {o.customerName}
                      </div>
                      <div className="muted num" style={{ fontSize: "0.7rem" }}>
                        {o.customerEmail}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-purple">
                        {ORDER_TYPE_LABELS[o.type]}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-ok">
                        {ORDER_STATUS_LABELS[o.status]}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${o.paymentStatus === "PAID" ? "badge-ok" : o.paymentStatus === "FAILED" ? "badge-err" : "badge-warn"}`}
                      >
                        {o.paymentStatus}
                      </span>
                    </td>
                    <td className="num muted">
                      {o._count.items + o._count.services + o._count.repairs}
                    </td>
                    <td className="num">{formatINR(o.total)}</td>
                    <td className="muted num">
                      {fmtIST(o.createdAt, { day: "2-digit", month: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AdminPagination
        page={result.page}
        pages={result.pages}
        total={result.total}
        searchParams={sp}
        basePath="/admin/orders/completed"
        unit="completed orders"
      />
    </div>
  );
}
