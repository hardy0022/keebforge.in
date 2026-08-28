import Link from "next/link";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { getAdminReviews } from "@/lib/admin";
import { moderateReview } from "@/app/admin/actions/reviews";
import { ReviewDeleteButton } from "@/components/admin/reviews/ReviewDeleteButton";

export const metadata: Metadata = {
  title: "Reviews | KeebForge Admin",
  robots: { index: false, follow: false },
};

const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
const TYPES = ["PRODUCT", "SERVICE", "REPAIR", "GENERAL"] as const;

const STATUS_BADGE: Record<string, string> = {
  PENDING: "badge-warn",
  APPROVED: "badge-ok",
  REJECTED: "badge-err",
};

function productLabel(r: {
  type: string;
  productNameSnapshot: string | null;
  productSlugSnapshot: string | null;
  product: { name: string; slug: string; active: boolean } | null;
}): { label: string; href?: string } {
  if (r.type === "GENERAL") return { label: "General review" };
  const live = r.product && r.product.active ? r.product : null;
  const label = r.productNameSnapshot ?? r.product?.name ?? "Product deleted";
  const slug = r.productSlugSnapshot;
  return live ? { label, href: `/product/${live.slug}` } : slug ? { label, href: `/product/${slug}` } : { label };
}

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; rating?: string; q?: string; page?: string }>;
}) {
  await requirePermission("product", "view");
  const sp = await searchParams;
  const result = await getAdminReviews({
    status: STATUSES.includes(sp.status as never) ? (sp.status as (typeof STATUSES)[number]) : undefined,
    type: TYPES.includes(sp.type as never) ? (sp.type as (typeof TYPES)[number]) : undefined,
    rating: sp.rating && !Number.isNaN(Number(sp.rating)) ? Number(sp.rating) : undefined,
    q: sp.q,
    page: Math.max(1, Number(sp.page) || 1),
  });

  const link = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    if (sp.q) p.set("q", sp.q);
    if (sp.status) p.set("status", sp.status);
    if (sp.type) p.set("type", sp.type);
    if (sp.rating) p.set("rating", sp.rating);
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `/admin/reviews?${s}` : "/admin/reviews";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          Reviews <span className="muted num">({result.total})</span>
        </h1>
      </div>

      <form method="get" action="/admin/reviews" style={{ display: "flex", flexWrap: "wrap", gap: 10 }} className="admin-card">
        <input className="input" name="q" defaultValue={sp.q} placeholder="Search title, body, author or product" style={{ flex: "1 1 220px" }} />
        <select className="select" name="status" defaultValue={sp.status ?? ""} style={{ flex: "0 1 150px" }}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="select" name="type" defaultValue={sp.type ?? ""} style={{ flex: "0 1 130px" }}>
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select className="select" name="rating" defaultValue={sp.rating ?? ""} style={{ flex: "0 1 120px" }}>
          <option value="">Any rating</option>
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>
              {r}★
            </option>
          ))}
        </select>
        <div className="admin-actions" style={{ marginLeft: "auto" }}>
          <button type="submit" className="btn-admin primary">
            Filter
          </button>
          {Object.keys(sp).length > 0 && (
            <Link href="/admin/reviews" className="btn-admin">
              Clear
            </Link>
          )}
        </div>
      </form>

      {result.items.length === 0 ? (
        <div className="empty">
          <b>No reviews match</b>
          New customer reviews will appear here for moderation before they go live.
        </div>
      ) : (
        <div className="admin-card" style={{ padding: 8 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Review</th>
                  <th>Product</th>
                  <th>Customer</th>
                  <th>Rating</th>
                  <th>Status</th>
                  <th>Photos</th>
                  <th>Moderation</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((r) => {
                  const prod = productLabel(r);
                  return (
                    <tr key={r.id}>
                      <td style={{ minWidth: 220 }}>
                        {r.title && <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>{r.title}</div>}
                        <div className="muted" style={{ fontSize: "0.75rem", lineHeight: 1.45 }}>
                          {r.body.length > 90 ? `${r.body.slice(0, 90)}…` : r.body}
                        </div>
                        {r.type !== "PRODUCT" && r.serviceLabel && (
                          <div className="muted num" style={{ fontSize: "0.7rem" }}>
                            {r.serviceLabel} · {r.type}
                          </div>
                        )}
                      </td>
                      <td>
                        {prod.href ? (
                          <Link href={prod.href} target="_blank" style={{ color: "var(--acc)", fontWeight: 600 }}>
                            {prod.label}
                          </Link>
                        ) : r.type === "GENERAL" ? (
                          <span style={{ fontWeight: 600 }}>{prod.label}</span>
                        ) : (
                          <span
                            style={{
                              fontWeight: 600,
                              textDecoration: "line-through",
                              opacity: 0.7,
                              cursor: "help",
                            }}
                          >
                            {prod.label}
                          </span>
                        )}
                        {r.type === "PRODUCT" && (
                          <div className="muted num" style={{ fontSize: "0.68rem" }}>
                            {r.verified ? "verified purchase" : "not verified"}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: "0.8rem" }}>{r.profile?.name ?? r.authorName ?? "Guest"}</div>
                        {r.profile?.email && (
                          <div className="muted num" style={{ fontSize: "0.7rem" }}>
                            {r.profile.email}
                          </div>
                        )}
                      </td>
                      <td className="num">{r.rating}★</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                        <div className="muted num" style={{ fontSize: "0.66rem" }}>
                          {r.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </div>
                      </td>
                      <td className="num muted">{r.images.length}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <form action={moderateReview.bind(null, r.id, "APPROVED")}>
                            <button type="submit" className="btn-admin sm ok" disabled={r.status === "APPROVED"}>
                              Approve
                            </button>
                          </form>
                          <form action={moderateReview.bind(null, r.id, "PENDING")}>
                            <button type="submit" className="btn-admin sm" disabled={r.status === "PENDING"}>
                              Requeue
                            </button>
                          </form>
                          <form action={moderateReview.bind(null, r.id, "REJECTED")}>
                            <button type="submit" className="btn-admin sm" disabled={r.status === "REJECTED"}>
                              Reject
                            </button>
                          </form>
                          <ReviewDeleteButton reviewId={r.id} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
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