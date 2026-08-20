import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getInventoryRows, getInventoryMovements, availableStock } from "@/lib/admin-catalog";
import { InventoryForm } from "@/components/admin/products/ProductDetailClient";

export const metadata: Metadata = { title: "Inventory | KeebForge Admin", robots: { index: false, follow: false } };

export default async function AdminInventoryPage() {
  await requireAdmin();
  const [rows, movements] = await Promise.all([getInventoryRows(), getInventoryMovements(60)]);

  const statusOf = (stock: number, reserved: number, threshold: number) => {
    const avail = availableStock(stock, reserved);
    return avail > 0 ? { cls: "badge-ok", label: `${avail} available` } : stock > 0 && stock <= threshold ? { cls: "badge-warn", label: `${avail} available` } : { cls: "badge-err", label: "Out" };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Link href="/admin/products" className="muted" style={{ fontSize: "0.75rem" }}>← Products</Link>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2 }}>Inventory</h1>
        <p className="muted" style={{ marginTop: 2 }}>Stock, reservations and adjustments — every change writes a transaction.</p>
      </div>

      <div className="admin-card" style={{ padding: 8 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr><th>Product</th><th>Variant</th><th>SKU</th><th>Stock</th><th>Reserved</th><th>Available</th><th>Threshold</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const badge = statusOf(p.stock, p.reservedQuantity, p.lowStockThreshold);
                return (
                  <ProductRow key={p.id} product={p as never} badge={badge} />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-card">
        <h3>Recent movements</h3>
        {movements.length === 0 ? (
          <div className="empty"><b>No inventory movements yet</b></div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead><tr><th>Product</th><th>Variant</th><th>Change</th><th>Reason</th><th>Admin</th><th>When</th></tr></thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td><Link href={`/admin/products/${m.product.id}`} style={{ fontWeight: 600 }}>{m.product.name}</Link></td>
                    <td className="muted">{m.variant?.name ?? "—"}</td>
                    <td className="num" style={{ color: m.delta > 0 ? "var(--ok)" : "var(--err)" }}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
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

function ProductRow({ product, badge }: { product: { id: string; name: string; sku: string | null; stock: number; reservedQuantity: number; lowStockThreshold: number; variants: { id: string; name: string; sku: string | null; stock: number; reservedQuantity: number }[] }; badge: { cls: string; label: string } }) {
  const vBadges = (v: { stock: number; reservedQuantity: number }) => {
    const avail = availableStock(v.stock, v.reservedQuantity);
    return { cls: avail > 0 ? "badge-ok" : "badge-err", label: avail > 0 ? `${avail} available` : "Out" };
  };
  return (
    <>
      <tr>
        <td style={{ fontWeight: 600 }}>{product.name}</td>
        <td className="muted">—</td>
        <td className="num muted">{product.sku ?? "—"}</td>
        <td className="num">{product.stock}</td>
        <td className="num muted">{product.reservedQuantity}</td>
        <td className="num">{availableStock(product.stock, product.reservedQuantity)}</td>
        <td className="num muted">{product.lowStockThreshold}</td>
        <td><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
        <td>
          <details>
            <summary className="btn-admin sm" style={{ listStyle: "none", cursor: "pointer" }}>Adjust</summary>
            <div style={{ marginTop: 8, minWidth: 300 }}><InventoryForm productId={product.id} /></div>
          </details>
        </td>
      </tr>
      {product.variants.map((v) => {
        const b = vBadges(v);
        return (
          <tr key={v.id} style={{ opacity: 0.85 }}>
            <td style={{ paddingLeft: 28, color: "var(--t2)" }}>↳ {product.name}</td>
            <td>{v.name}</td>
            <td className="num muted">{v.sku ?? "—"}</td>
            <td className="num">{v.stock}</td>
            <td className="num muted">{v.reservedQuantity}</td>
            <td className="num">{availableStock(v.stock, v.reservedQuantity)}</td>
            <td className="num muted">{product.lowStockThreshold}</td>
            <td><span className={`badge ${b.cls}`}>{b.label}</span></td>
            <td>
              <details>
                <summary className="btn-admin sm" style={{ listStyle: "none", cursor: "pointer" }}>Adjust</summary>
                <div style={{ marginTop: 8, minWidth: 300 }}><InventoryForm productId={product.id} variantId={v.id} /></div>
              </details>
            </td>
          </tr>
        );
      })}
    </>
  );
}