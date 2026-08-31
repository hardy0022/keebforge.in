import Link from "next/link";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";
import { formatINR } from "@/lib/money";

export const metadata: Metadata = {
  title: "Payments | KeebForge Admin",
  robots: { index: false, follow: false },
};

const STATUS_BADGE: Record<string, string> = {
  PAID: "badge-ok",
  PARTIALLY_PAID: "badge-warn",
  PENDING: "badge-warn",
  FAILED: "badge-err",
  REFUNDED: "badge-purple",
};

function methodLabel(m: string | null): string {
  if (!m) return "—";
  return m
    .toLowerCase()
    .split(/[_ -]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requirePermission("order", "view");
  const sp = await searchParams;

  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 50;
  const skip = (page - 1) * pageSize;

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      include: { order: { select: { orderNumber: true, customerName: true, customerEmail: true } } },
      skip,
      take: pageSize,
    }),
    prisma.payment.count(),
  ]);

  const summary = await prisma.payment.groupBy({
    by: ["status"],
    _sum: { amount: true },
    _count: { _all: true },
  });

  const stat = (s: string) => summary.find((r) => r.status === s);
  const collected = stat("PAID")?._sum.amount ?? 0;
  const pending = (stat("PENDING")?._sum.amount ?? 0) + (stat("PARTIALLY_PAID")?._sum.amount ?? 0);
  const failed = stat("FAILED")?._sum.amount ?? 0;
  const refunded = stat("REFUNDED")?._sum.amount ?? 0;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          Payments <span className="muted num">({total})</span>
        </h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <div className="admin-stat lime"><b>{formatINR(collected)}</b><span>Collected (Paid)</span></div>
        <div className="admin-stat warn"><b>{formatINR(pending)}</b><span>Pending</span></div>
        <div className="admin-stat err"><b>{formatINR(failed)}</b><span>Failed</span></div>
        <div className="admin-stat purple"><b>{formatINR(refunded)}</b><span>Refunded</span></div>
      </div>

      <div className="admin-card" style={{ overflow: "auto" }}>
        <table className="admin-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Payment</th>
              <th>Order</th>
              <th>Customer</th>
              <th>Date</th>
              <th>Method</th>
              <th className="num">Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td style={{ whiteSpace: "nowrap" }}>
                  <span className="num" style={{ fontFamily: "var(--ff-mono, monospace)" }}>#{p.id.slice(0, 8)}</span>
                  <div className="muted" style={{ fontSize: "0.68rem" }}>{p.razorpayPaymentId ?? ""}</div>
                </td>
                <td>
                  <a href={`/admin/orders/${p.order.orderNumber}`} className="muted" style={{ textDecoration: "underline" }}>
                    {p.order.orderNumber}
                  </a>
                </td>
                <td>
                  <div style={{ fontSize: "0.82rem" }}>{p.order.customerName || p.order.customerEmail}</div>
                  {p.order.customerName && p.order.customerEmail && (
                    <div className="muted" style={{ fontSize: "0.7rem" }}>{p.order.customerEmail}</div>
                  )}
                </td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>
                  {new Date(p.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </td>
                <td>{methodLabel(p.method)}</td>
                <td className="num" style={{ fontWeight: 600 }}>{formatINR(p.amount)}</td>
                <td>
                  <span className={`badge ${STATUS_BADGE[p.status] ?? ""}`} style={{ fontSize: "0.65rem", padding: "2px 8px" }}>
                    {p.status.replace("_", " ")}
                  </span>
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 30 }}>
                  No payments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {page > 1 && (
            <a className="btn-admin sm" href={`/admin/payments?page=${page - 1}`}>← Prev</a>
          )}
          <span className="muted" style={{ fontSize: "0.8rem" }}>Page {page} of {totalPages}</span>
          {page < totalPages && (
            <a className="btn-admin sm" href={`/admin/payments?page=${page + 1}`}>Next →</a>
          )}
        </div>
      )}

      <Link href="/admin" className="muted" style={{ fontSize: "0.75rem" }}>← Dashboard</Link>
    </div>
  );
}
