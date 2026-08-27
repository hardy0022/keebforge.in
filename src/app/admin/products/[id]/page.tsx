import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { formatINR } from "@/lib/money";
import { getAdminProduct, PRODUCT_STATUS_LABELS, PRODUCT_TYPE_LABELS, availableStock } from "@/lib/admin-catalog";
import { ProductStatusBar, VariantsManager, InventoryForm } from "@/components/admin/products/ProductDetailClient";

export const metadata: Metadata = { title: "Product | KeebForge Admin", robots: { index: false, follow: false } };

export default async function AdminProductDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("product", "view");
  const { id } = await params;
  const product = await getAdminProduct(id);
  if (!product) notFound();

  const specs = product.specifications && typeof product.specifications === "object" ? (product.specifications as Record<string, string>) : null;
  const features = Array.isArray(product.features) ? product.features : product.features && typeof product.features === "object" && "list" in product.features ? (product.features as { list: string[] }).list : [];
  const included = product.whatsIncluded && typeof product.whatsIncluded === "object" && "list" in product.whatsIncluded ? (product.whatsIncluded as { list: string[] }).list : [];
  const margin = product.price - (product.costPrice ?? 0);
  const salesUnits = product.orderItems.reduce((s, o) => s + o.quantity, 0);
  const salesRevenue = product.orderItems.reduce((s, o) => s + o.lineTotal, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <Link href="/admin/products" className="muted" style={{ fontSize: "0.75rem" }}>← Products</Link>
          <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2 }}>{product.name}</h1>
        </div>
        <div className="admin-actions">
          <span className="badge badge-purple">{PRODUCT_TYPE_LABELS[product.type]}</span>
          <span className={`badge ${product.status === "ACTIVE" ? "badge-lime" : product.status === "DRAFT" ? "badge-warn" : "badge-err"}`}>{PRODUCT_STATUS_LABELS[product.status]}</span>
          {product.featured && <span className="badge badge-lime">Featured</span>}
          {product.popular && <span className="badge">Popular</span>}
          {product.isNew && <span className="badge">New</span>}
          <Link href={`/admin/products/${id}/edit`} className="btn-admin primary">Edit</Link>
        </div>
      </div>

      <ProductStatusBar productId={product.id} slug={product.slug} status={product.status} />

      <div className="admin-grid cols-2" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="admin-grid" style={{ gridTemplateColumns: "1fr", gap: 16 }}>
          <div className="admin-card">
            <h3>Overview</h3>
            <div className="kv"><dt>Category</dt><dd>{product.category.name}</dd></div>
            <div className="kv"><dt>Brand</dt><dd>{product.brand?.name ?? "—"}</dd></div>
            <div className="kv"><dt>Slug</dt><dd><Link href={`/product/${product.slug}`} style={{ color: "var(--acc)" }}>/product/{product.slug}</Link></dd></div>
            <div className="kv"><dt>SKU</dt><dd className="num">{product.sku ?? "—"}</dd></div>
            <div className="kv"><dt>Barcode</dt><dd className="num">{product.barcode ?? "—"}</dd></div>
            {product.description && <p style={{ fontSize: "0.82rem", color: "var(--t2)" }}>{product.description}</p>}
          </div>

          <div className="admin-card">
            <h3>Pricing</h3>
            <div className="kv"><dt>Selling price</dt><dd className="num">{formatINR(product.price)}</dd></div>
            {product.compareAtPrice != null && product.compareAtPrice > 0 && <div className="kv"><dt>Compare-at</dt><dd className="num">{formatINR(product.compareAtPrice)}</dd></div>}
            <div className="kv"><dt>Cost price</dt><dd className="num">{product.costPrice != null ? formatINR(product.costPrice) : "—"}</dd></div>
            <div className="kv"><dt>GST rate</dt><dd className="num">{product.gstRate}%</dd></div>
            <div className="kv"><dt>Margin</dt><dd className={`num ${margin >= 0 ? "" : "muted"}`}>{product.costPrice != null ? formatINR(margin) : "—"}</dd></div>
          </div>

          <div className="admin-card">
            <h3>Shipping</h3>
            <div className="kv"><dt>Weight</dt><dd className="num">{product.weight != null ? `${product.weight} g` : "—"}</dd></div>
            <div className="kv"><dt>Dimensions</dt><dd className="num">{product.lengthCm && product.widthCm && product.heightCm ? `${product.lengthCm} × ${product.widthCm} × ${product.heightCm} cm` : "—"}</dd></div>
            <div className="kv"><dt>Shipping class</dt><dd>{product.shippingClass ?? "—"}</dd></div>
            <div className="kv"><dt>Free shipping</dt><dd>{product.freeShipping ? "Yes" : "No"}</dd></div>
            {product.shippingRestrictions && <p className="muted" style={{ marginTop: 8 }}>{product.shippingRestrictions}</p>}
          </div>
        </div>

        <div className="admin-grid" style={{ gridTemplateColumns: "1fr", gap: 16 }}>
          <div className="admin-card">
            <h3>Inventory</h3>
            <div className="kv"><dt>Stock</dt><dd className="num">{product.stock}</dd></div>
            <div className="kv"><dt>Reserved</dt><dd className="num">{product.reservedQuantity}</dd></div>
            <div className="kv"><dt>Available</dt><dd className="num">{availableStock(product.stock, product.reservedQuantity)}</dd></div>
            <div className="kv"><dt>Low-stock threshold</dt><dd className="num">{product.lowStockThreshold}</dd></div>
            <div className="kv"><dt>Backorders</dt><dd>{product.allowBackorders ? "Allowed" : "Not allowed"}</dd></div>
            <div className="kv"><dt>Tracking</dt><dd>{product.inventoryTracking ? "Enabled" : "Disabled"}</dd></div>
          </div>

          <InventoryForm productId={product.id} />

          <div className="admin-card">
            <h3>Sales</h3>
            <div className="kv"><dt>Units sold</dt><dd className="num">{salesUnits}</dd></div>
            <div className="kv"><dt>Revenue</dt><dd className="num">{formatINR(salesRevenue)}</dd></div>
          </div>

          <div className="admin-card">
            <h3>Reviews</h3>
            {product.reviews.length === 0 ? (
              <div className="empty"><b>No reviews yet</b></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {product.reviews.slice(0, 5).map((r) => (
                  <div key={r.id} style={{ fontSize: "0.8rem", background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: "var(--r-sm)", padding: 8 }}>
                    <span className={`badge ${r.status === "APPROVED" ? "badge-ok" : r.status === "REJECTED" ? "badge-err" : "badge-warn"}`}>{r.status}</span>{" "}
                    <b>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</b>
                    <div style={{ marginTop: 4 }}>{r.body}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Images */}
      <div className="admin-card">
        <h3>Images</h3>
        {product.images.length === 0 ? (
          <div className="empty"><b>No images</b>Add images from the Edit page.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {product.images.map((img) => (
              <div key={img.id} style={{ position: "relative" }}>
                <Image src={img.url} alt={img.alt ?? product.name} width={120} height={120} style={{ borderRadius: 10, objectFit: "cover", border: img.primary ? "2px solid var(--acc)" : "1px solid var(--bdr)" }} />
                {img.primary && <span className="badge badge-lime" style={{ position: "absolute", top: 6, left: 6 }}>Primary</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Variants + per-variant inventory */}
      <VariantsManager productId={product.id} variants={product.variants} />
      {product.variants.length > 0 && (
        <div className="admin-grid cols-2" style={{ gridTemplateColumns: "1fr" }}>
          {product.variants.map((v) => (
            <InventoryForm key={v.id} productId={product.id} variantId={v.id} variantLabel={v.name} />
          ))}
        </div>
      )}

      {/* Specifications / features / included */}
      <div className="admin-grid cols-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {specs && Object.keys(specs).length > 0 && (
          <div className="admin-card">
            <h3>Specifications</h3>
            {Object.entries(specs).map(([k, v]) => (
              <div className="kv" key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>
            ))}
          </div>
        )}
        <div className="admin-grid" style={{ gridTemplateColumns: "1fr", gap: 16 }}>
          {features.length > 0 && (
            <div className="admin-card"><h3>Features</h3><ul style={{ display: "flex", flexDirection: "column", gap: 4 }}>{features.map((f, i) => <li key={i} style={{ fontSize: "0.84rem" }}>• {String(f)}</li>)}</ul></div>
          )}
          {included.length > 0 && (
            <div className="admin-card"><h3>What&apos;s included</h3><ul style={{ display: "flex", flexDirection: "column", gap: 4 }}>{included.map((f, i) => <li key={i} style={{ fontSize: "0.84rem" }}>• {String(f)}</li>)}</ul></div>
          )}
        </div>
      </div>

      {/* Orders */}
      <div className="admin-card" style={{ padding: 8 }}>
        <h3 style={{ margin: "0 8px 8px" }}>Recent orders</h3>
        {product.orderItems.length === 0 ? (
          <div className="empty"><b>No orders yet</b>Sales will appear here after checkout is live.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead><tr><th>Order</th><th>Qty</th><th>Unit price</th><th>Total</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {product.orderItems.map((oi) => (
                  <tr key={oi.id}>
                    <td><Link href={`/admin/orders/${oi.order.orderNumber}`} style={{ color: "var(--acc)", fontWeight: 600 }}>{oi.order.orderNumber}</Link></td>
                    <td className="num">{oi.quantity}</td>
                    <td className="num">{formatINR(oi.unitPrice)}</td>
                    <td className="num">{formatINR(oi.lineTotal)}</td>
                    <td className="muted num">{oi.order.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                    <td><span className="badge">{oi.order.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Activity */}
      <div className="admin-card">
        <h3>Inventory activity</h3>
        {product.inventoryMovements.length === 0 ? (
          <div className="empty"><b>No inventory movements yet</b></div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead><tr><th>Change</th><th>Reason</th><th>Admin</th><th>When</th></tr></thead>
              <tbody>
                {product.inventoryMovements.map((m) => (
                  <tr key={m.id}>
                    <td className={`num ${m.delta > 0 ? "" : ""}`} style={{ color: m.delta > 0 ? "var(--ok)" : "var(--err)" }}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                    <td>{m.reason}</td>
                    <td className="muted">{m.profile?.name ?? m.profile?.email ?? "—"}</td>
                    <td className="muted num">{m.createdAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
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