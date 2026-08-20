"use client";

import { useState } from "react";
import { ActionForm, Spinner } from "@/components/admin/ActionForm";
import { setProductStatus, duplicateProduct, saveVariant, deleteVariant, adjustInventory } from "@/app/admin/actions/catalog";
import { PRODUCT_STATUS_LABELS } from "@/lib/product-labels";

type VariantProp = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number | null;
  compareAtPrice: number | null;
  stock: number;
  reservedQuantity: number;
  weight: number | null;
  active: boolean;
};

export function ProductStatusBar({
  productId,
  slug,
  status,
}: {
  productId: string;
  slug: string;
  status: keyof typeof PRODUCT_STATUS_LABELS;
}) {
  const isActive = status === "ACTIVE";
  const isArchived = status === "ARCHIVED";
  return (
    <div className="admin-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Publishing</h3>
        <span className={`badge ${isActive ? "badge-lime" : isArchived ? "badge-err" : status === "DRAFT" ? "badge-warn" : "badge"}`}>
          {PRODUCT_STATUS_LABELS[status]}
        </span>
      </div>
      <div className="admin-actions">
        <form action={async (fd: FormData) => { await setProductStatus({}, fd); }}>
          <input type="hidden" name="id" value={productId} />
          <input type="hidden" name="status" value={isArchived ? "ACTIVE" : "ARCHIVED"} />
          <button className={`btn-admin ${isArchived ? "" : "danger"}`} type="submit">
            {isArchived ? "Restore" : "Archive"}
          </button>
        </form>
        <form action={async (fd: FormData) => { await setProductStatus({}, fd); }}>
          <input type="hidden" name="id" value={productId} />
          <input type="hidden" name="status" value={isActive ? "DRAFT" : "ACTIVE"} />
          <button className="btn-admin" type="submit">{isActive ? "Unpublish" : "Publish"}</button>
        </form>
        <form action={async (fd: FormData) => { await duplicateProduct({}, fd); }}>
          <input type="hidden" name="id" value={productId} />
          <button className="btn-admin" type="submit">Duplicate</button>
        </form>
        <a className="btn-admin" href={`/product/${slug}`} target="_blank" rel="noopener noreferrer">View on shop ↗</a>
      </div>
    </div>
  );
}

export function VariantsManager({ productId, variants }: { productId: string; variants: VariantProp[] }) {
  const [editing, setEditing] = useState<VariantProp | null>(null);
  return (
    <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h3 style={{ marginBottom: 0 }}>Variants</h3>
      {variants.length === 0 ? (
        <div className="empty"><b>No variants yet</b>Add variants for options like colour, switch type or layout.</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr><th>Name</th><th>SKU</th><th>Price</th><th>Stock</th><th>Available</th><th></th></tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id}>
                <td>{v.name}{!v.active && <span className="badge badge-err" style={{ marginLeft: 6 }}>Disabled</span>}</td>
                <td className="num muted">{v.sku ?? "—"}</td>
                <td className="num">{v.price != null ? `₹${(v.price / 100).toFixed(2)}` : "Inherit"}</td>
                <td className="num">{v.stock}</td>
                <td className="num">{Math.max(0, v.stock - v.reservedQuantity)}</td>
                <td>
                  <div className="admin-actions" style={{ gap: 4 }}>
                    <button className="btn-admin sm" onClick={() => setEditing(v)}>Edit</button>
                    <ActionForm action={deleteVariant} toastLabel="Variant">
                      {(pending) => (
                        <>
                          <input type="hidden" name="id" value={v.id} />
                          <button type="submit" className="btn-admin sm danger" disabled={pending} onClick={(e) => { if (!confirm(`Delete variant "${v.name}"? Products in carts/orders keep their snapshot.`)) e.preventDefault(); }}>{pending ? <Spinner light /> : "Delete"}</button>
                        </>
                      )}
                    </ActionForm>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ borderTop: "1px solid var(--bdr)", paddingTop: 14 }}>
        <h4 style={{ fontFamily: "var(--ff-display)", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 10 }}>
          {editing ? `Edit variant: ${editing.name}` : "Add variant"}
        </h4>
        <ActionForm action={saveVariant} toastLabel={editing ? "Variant change" : "Variant"}>
          {(pending) => (
            <div className="admin-grid cols-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              <input type="hidden" name="productId" value={productId} />
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <input className="input" name="name" placeholder="Name (e.g. Black linear)" defaultValue={editing?.name ?? ""} required disabled={pending} />
              <input className="input" name="sku" placeholder="SKU" defaultValue={editing?.sku ?? ""} disabled={pending} />
              <input className="input" type="number" step="0.01" name="price" placeholder="Price ₹ (blank = inherit)" defaultValue={editing?.price != null ? editing.price / 100 : ""} min={0} disabled={pending} />
              <input className="input" type="number" step="0.01" name="compareAtPrice" placeholder="Compare-at ₹" defaultValue={editing?.compareAtPrice != null ? editing.compareAtPrice / 100 : ""} min={0} disabled={pending} />
              <input className="input" type="number" name="stock" placeholder="Stock" defaultValue={editing?.stock ?? 0} min={0} disabled={pending} />
              <input className="input" type="number" name="weight" placeholder="Weight (g)" defaultValue={editing?.weight ?? ""} min={0} disabled={pending} />
              <input className="input" name="options" placeholder="Options (Color: Black)" defaultValue={editing ? "" : ""} disabled={pending} />
              <input className="input" name="barcode" placeholder="Barcode" defaultValue={editing?.barcode ?? ""} disabled={pending} />
              <div className="admin-actions" style={{ gridColumn: "1 / -1" }}>
                <button type="submit" className="btn-admin primary" disabled={pending}>{pending ? <Spinner /> : editing ? "Save variant" : "Add variant"}</button>
                {editing && <button type="button" className="btn-admin" onClick={() => setEditing(null)}>Cancel edit</button>}
              </div>
            </div>
          )}
        </ActionForm>
      </div>
    </div>
  );
}

const KINDS = [
  { value: "receive", label: "Receive shipment" },
  { value: "add", label: "Add stock" },
  { value: "remove", label: "Remove stock" },
  { value: "adjust", label: "Adjust stock" },
  { value: "damaged", label: "Mark damaged" },
  { value: "lost", label: "Mark lost" },
] as const;

export function InventoryForm({ productId, variantId, variantLabel }: { productId: string; variantId?: string; variantLabel?: string }) {
  return (
    <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={{ marginBottom: 0 }}>{variantLabel ? `Inventory — ${variantLabel}` : "Inventory"}</h3>
      <ActionForm action={adjustInventory} toastLabel="Inventory change">
        {(pending) => (
          <div className="admin-actions" style={{ alignItems: "flex-end" }}>
            <input type="hidden" name="productId" value={productId} />
            {variantId && <input type="hidden" name="variantId" value={variantId} />}
            <select name="kind" className="select" style={{ flex: "0 1 180px" }} disabled={pending}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <input type="number" name="quantity" className="input" placeholder="Qty" min={1} required style={{ flex: "0 1 110px" }} disabled={pending} />
            <input name="note" className="input" placeholder="Note (optional)" style={{ flex: "1 1 180px" }} disabled={pending} />
            <button type="submit" className="btn-admin" disabled={pending}>{pending ? <Spinner light /> : "Apply"}</button>
          </div>
        )}
      </ActionForm>
    </div>
  );
}