import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { formatINR } from "@/lib/money";
import { getAdminProducts, getAdminCategories, getAdminBrands, PRODUCT_STATUS_LABELS, PRODUCT_TYPE_LABELS } from "@/lib/admin-catalog";

export const metadata: Metadata = { title: "Products | KeebForge Admin", robots: { index: false, follow: false } };

const STATUSES = ["any", "DRAFT", "ACTIVE", "OUT_OF_STOCK", "ARCHIVED"] as const;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; brand?: string; stock?: string; status?: string; sort?: string; page?: string }>;
}) {
  await requirePermission("product", "view");
  const sp = await searchParams;
  const [categories, brands, result] = await Promise.all([
    getAdminCategories(),
    getAdminBrands(),
    getAdminProducts({
      q: sp.q,
      category: sp.category,
      brand: sp.brand,
      stock: sp.stock as never,
      status: sp.status as never,
      sort: (sp.sort as never) || "newest",
      page: Math.max(1, Number(sp.page) || 1),
    }),
  ]);

  const link = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const k of ["q", "category", "brand", "stock", "status", "sort"] as const) {
      const v = k in sp ? sp[k as keyof typeof sp] : undefined;
      if (v) p.set(k, v);
    }
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, String(v));
    }
    const s = p.toString();
    return s ? `/admin/products?${s}` : "/admin/products";
  };

  const stockBadge = (p: { stock: number; available: number; lowStockThreshold: number }) =>
    p.available > 0 ? { cls: "badge-ok", label: `In stock (${p.available})` } : p.stock > 0 && p.stock <= p.lowStockThreshold ? { cls: "badge-warn", label: `Low stock (${p.available})` } : { cls: "badge-err", label: "Out of stock" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            Products <span className="muted num">({result.total})</span>
          </h1>
          <p className="muted" style={{ marginTop: 2 }}>Manage KeebForge shop inventory and products.</p>
        </div>
        <div className="admin-actions">
          <Link href="/admin/products/new" className="btn-admin primary">+ Add Product</Link>
          <Link href="/admin/products/export" className="btn-admin">Export Products</Link>
          <Link href="/admin/products/import" className="btn-admin">Import Products</Link>
        </div>
      </div>

      <form method="get" action="/admin/products" style={{ display: "flex", flexWrap: "wrap", gap: 10 }} className="admin-card">
        <input className="input" name="q" defaultValue={sp.q} placeholder="Search name, SKU or slug" style={{ flex: "1 1 200px" }} />
        <select className="select" name="category" defaultValue={sp.category ?? ""} style={{ flex: "0 1 170px" }}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>{c.name}</option>
          ))}
        </select>
        <select className="select" name="brand" defaultValue={sp.brand ?? ""} style={{ flex: "0 1 150px" }}>
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.slug}>{b.name}</option>
          ))}
        </select>
        <select className="select" name="stock" defaultValue={sp.stock ?? ""} style={{ flex: "0 1 130px" }}>
          <option value="">All stock</option>
          <option value="in">In stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
        <select className="select" name="status" defaultValue={sp.status ?? "any"} style={{ flex: "0 1 150px" }}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s === "any" ? "All statuses" : PRODUCT_STATUS_LABELS[s as never]}</option>
          ))}
        </select>
        <select className="select" name="sort" defaultValue={sp.sort ?? "newest"} style={{ flex: "0 1 150px" }}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="price-asc">Price low→high</option>
          <option value="price-desc">Price high→low</option>
          <option value="name-asc">Name A→Z</option>
        </select>
        <div className="admin-actions" style={{ marginLeft: "auto" }}>
          <button type="submit" className="btn-admin primary">Filter</button>
          {Object.keys(sp).length > 0 && <Link href="/admin/products" className="btn-admin">Clear</Link>}
        </div>
      </form>

      {result.items.length === 0 ? (
        <div className="empty">
          <b>No products found</b>
          Add your first product to start selling on the shop.
        </div>
      ) : (
        <div className="admin-card" style={{ padding: 8 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Brand</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Sales</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((p) => {
                  const badge = stockBadge(p);
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 200 }}>
                          {p.images[0] ? (
                            <Image src={p.images[0].url} alt={p.name} width={40} height={40} style={{ borderRadius: 8, objectFit: "cover" }} />
                          ) : (
                            <span className="avatar" style={{ width: 40, height: 40, fontSize: "0.8rem" }}>{p.name.charAt(0)}</span>
                          )}
                          <div>
                            <Link href={`/admin/products/${p.id}`} style={{ fontWeight: 600 }}>{p.name}</Link>
                            {p.featured && <span className="badge badge-lime" style={{ marginLeft: 6 }}>Featured</span>}
                            <div className="muted num" style={{ fontSize: "0.68rem" }}>{PRODUCT_TYPE_LABELS[p.type]}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num muted">{p.sku ?? "—"}</td>
                      <td>{p.category.name}</td>
                      <td>{p.brand?.name ?? "—"}</td>
                      <td className="num">
                        {formatINR(p.price)}
                        {p.compareAtPrice && p.compareAtPrice > p.price && <span className="muted line-through" style={{ display: "block", fontSize: "0.7rem" }}>{formatINR(p.compareAtPrice)}</span>}
                      </td>
                      <td><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                      <td><span className={`badge ${p.status === "ACTIVE" ? "badge-lime" : p.status === "DRAFT" ? "badge-warn" : "badge-err"}`}>{PRODUCT_STATUS_LABELS[p.status]}</span></td>
                      <td className="num muted">{p.sales.units} sold</td>
                      <td className="muted num">{p.updatedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                      <td>
                        <div className="admin-actions" style={{ gap: 4 }}>
                          <Link href={`/admin/products/${p.id}`} className="btn-admin sm">View</Link>
                          <Link href={`/admin/products/${p.id}/edit`} className="btn-admin sm">Edit</Link>
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
          <Link className="btn-admin sm" href={link({ page: result.page - 1 })} style={result.page <= 1 ? { pointerEvents: "none", opacity: 0.4 } : undefined}>← Prev</Link>
          <span className="muted num">Page {result.page} of {result.pages}</span>
          <Link className="btn-admin sm" href={link({ page: result.page + 1 })} style={result.page >= result.pages ? { pointerEvents: "none", opacity: 0.4 } : undefined}>Next →</Link>
        </div>
      )}
    </div>
  );
}