import Link from "next/link";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { getAdminCustomers, parseCustomerKind } from "@/lib/admin";
import { parsePage } from "@/lib/admin/pagination";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { formatINR } from "@/lib/utils/money";
import { fmtIST } from "@/lib/utils/ist";

export const metadata: Metadata = {
  title: "Customers | KeebForge Admin",
  robots: { index: false, follow: false },
};

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("customer", "view");
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? sp[k] : sp[k]?.[0]);

  const kind = parseCustomerKind(one("kind"));
  const result = await getAdminCustomers({
    q: one("q"),
    kind,
    page: parsePage(one("page")),
  });
  const { items: customers, total, pages, page, withOrders } = result;

  const join = (d: Date) =>
    fmtIST(d, { year: "numeric", month: "short", day: "numeric" });

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
          Customers <span className="muted num">({total})</span>
        </h1>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        <div className="admin-stat lime">
          <b>{result.registered}</b>
          <span>Registered</span>
        </div>
        <div className="admin-stat warn">
          <b>{result.guests}</b>
          <span>Guest Checkouts</span>
        </div>
        <div className="admin-stat">
          <b>{withOrders}</b>
          <span>With Orders</span>
        </div>
        <div className="admin-stat purple">
          <b>{formatINR(result.allTimeSpent)}</b>
          <span>Total Spent (All Time)</span>
        </div>
      </div>

      <form
        method="get"
        action="/admin/customers"
        style={{ display: "flex", flexWrap: "wrap", gap: 10 }}
        className="admin-card"
      >
        <input
          className="input"
          name="q"
          defaultValue={typeof sp.q === "string" ? sp.q : ""}
          placeholder="Search name, username, email or phone"
          style={{ flex: "1 1 240px" }}
        />
        <select
          className="select"
          name="kind"
          defaultValue={kind}
          style={{ flex: "0 1 190px" }}
        >
          <option value="all">All customers</option>
          <option value="registered">Registered only</option>
          <option value="guest">Guest checkouts only</option>
        </select>
        <div className="admin-actions" style={{ marginLeft: "auto" }}>
          <button type="submit" className="btn-admin primary">
            Search
          </button>
          {(one("q") || kind !== "all") && (
            <Link href="/admin/customers" className="btn-admin">
              Clear
            </Link>
          )}
        </div>
      </form>

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
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span
                      className="avatar"
                      style={{
                        width: 30,
                        height: 30,
                        fontSize: "0.62rem",
                        flexShrink: 0,
                      }}
                    >
                      {(c.name || c.email)[0]?.toUpperCase() ?? "?"}
                    </span>
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {c.name || "Unnamed"}
                        </span>
                        {c.isGuest && (
                          <span
                            className="badge badge-warn"
                            title="Checked out without an account — no registered profile"
                          >
                            GUEST
                          </span>
                        )}
                      </div>
                      {c.username && (
                        <div className="muted" style={{ fontSize: "0.7rem" }}>
                          @{c.username}
                        </div>
                      )}
                      {c.isGuest && (
                        <div className="muted" style={{ fontSize: "0.7rem" }}>
                          Guest checkout — no account
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  <Link
                    href={`/admin/orders?q=${encodeURIComponent(c.email)}`}
                    style={{ fontSize: "0.82rem", color: "var(--acc)" }}
                  >
                    {c.email}
                  </Link>
                  {c.phone && (
                    <div className="muted" style={{ fontSize: "0.72rem" }}>
                      {c.phone}
                    </div>
                  )}
                  {c.discordHandle && (
                    <div className="muted" style={{ fontSize: "0.72rem" }}>
                      Discord: {c.discordHandle}
                    </div>
                  )}
                </td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>
                  {join(c.createdAt)}
                  {c.isGuest && (
                    <div style={{ fontSize: "0.68rem" }}>First order</div>
                  )}
                </td>
                <td className="num">{c.orderCount}</td>
                <td className="num">{formatINR(c.totalSpent)}</td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="muted"
                  style={{ textAlign: "center", padding: 30 }}
                >
                  {one("q") || kind !== "all"
                    ? "No customers match this filter."
                    : "No customers yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination
        page={page}
        pages={pages}
        total={total}
        searchParams={sp}
        basePath="/admin/customers"
        unit="customers"
      />

      <Link href="/admin" className="muted" style={{ fontSize: "0.75rem" }}>
        ← Dashboard
      </Link>
    </div>
  );
}
