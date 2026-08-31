import Link from "next/link";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";
import { formatINR } from "@/lib/money";

export const metadata: Metadata = {
  title: "Customers | KeebForge Admin",
  robots: { index: false, follow: false },
};

export default async function AdminCustomersPage() {
  await requirePermission("customer", "view");

  const [customers, total] = await Promise.all([
    prisma.profile.findMany({
      where: { role: "CUSTOMER" },
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        _count: { select: { orders: { where: { isDeleted: false } } } },
        orders: { where: { isDeleted: false }, select: { total: true } },
      },
    }),
    prisma.profile.count({ where: { role: "CUSTOMER" } }),
  ]);

  const withOrders = customers.filter((c) => c._count.orders > 0).length;
  const totalPaid = customers.reduce((sum, c) => sum + c.orders.reduce((s, o) => s + o.total, 0), 0);

  const join = (d: Date) =>
    new Date(d).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          Customers <span className="muted num">({total})</span>
        </h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <div className="admin-stat lime"><b>{total}</b><span>Registered</span></div>
        <div className="admin-stat"><b>{withOrders}</b><span>With Orders</span></div>
        <div className="admin-stat purple"><b>{formatINR(totalPaid)}</b><span>Total Spent (All Time)</span></div>
      </div>

      <div className="admin-card" style={{ overflow: "auto" }}>
        <table className="admin-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Contact</th>
              <th>Joined</th>
              <th className="num">Orders</th>
              <th className="num">Total Spent</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="avatar" style={{ width: 30, height: 30, fontSize: "0.62rem", flexShrink: 0 }}>
                      {(c.name || c.email)[0]?.toUpperCase() ?? "?"}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600 }}>{c.name || "Unnamed"}</div>
                      {c.username && <div className="muted" style={{ fontSize: "0.7rem" }}>@{c.username}</div>}
                    </div>
                  </div>
                </td>
                <td>
                  <div style={{ fontSize: "0.82rem" }}>{c.email}</div>
                  {c.phone && <div className="muted" style={{ fontSize: "0.72rem" }}>{c.phone}</div>}
                  {c.customer?.discordHandle && <div className="muted" style={{ fontSize: "0.72rem" }}>Discord: {c.customer.discordHandle}</div>}
                </td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{join(c.createdAt)}</td>
                <td className="num">{c._count.orders}</td>
                <td className="num">{formatINR(c.orders.reduce((s, o) => s + o.total, 0))}</td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 30 }}>
                  No registered customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Link href="/admin" className="muted" style={{ fontSize: "0.75rem" }}>← Dashboard</Link>
    </div>
  );
}
