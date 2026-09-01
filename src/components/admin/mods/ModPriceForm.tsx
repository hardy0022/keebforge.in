"use client";

import { ActionForm, Spinner } from "@/components/admin/ActionForm";
import { saveMod } from "@/app/admin/actions/mods";

export type ModRowProp = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  unit: string;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  priceLabel: string | null;
  combo: boolean;
  popular: boolean;
  highlight: boolean;
  active: boolean;
  sortOrder: number;
};

const UNITS = [
  ["PER_SWITCH", "Per switch"],
  ["PER_STABILIZER", "Per stabilizer"],
  ["FLAT", "Flat"],
  ["QUOTE", "Quote"],
];

export function ModPriceForm({ svc }: { svc: ModRowProp }) {
  return (
    <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600 }}>{svc.name}</span>
        <span className="muted" style={{ fontSize: "0.72rem" }}>/{svc.slug}</span>
        <span className={`badge ${svc.active ? "badge-ok" : "badge-err"}`}>{svc.active ? "Active" : "Hidden"}</span>
      </div>
      {svc.description && <p className="muted" style={{ fontSize: "0.78rem", marginTop: -4 }}>{svc.description}</p>}

      <ActionForm action={saveMod} toastLabel="Mod">
        {(pending) => (
          <div className="admin-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, alignItems: "end" }}>
            <input type="hidden" name="id" value={svc.id} />
            <label className="form-row" style={{ marginBottom: 0, gap: 5 }}>
              <span className="admin-label">Unit</span>
              <select className="input" name="unit" defaultValue={svc.unit} disabled={pending}>
                {UNITS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <label className="form-row" style={{ marginBottom: 0, gap: 5 }}>
              <span className="admin-label">Price ₹</span>
              <input className="input" type="number" name="price" step="0.01" min="0" placeholder="—" defaultValue={svc.price != null ? svc.price / 100 : ""} disabled={pending} />
            </label>
            <label className="form-row" style={{ marginBottom: 0, gap: 5 }}>
              <span className="admin-label">Min ₹</span>
              <input className="input" type="number" name="priceMin" step="0.01" min="0" placeholder="—" defaultValue={svc.priceMin != null ? svc.priceMin / 100 : ""} disabled={pending} />
            </label>
            <label className="form-row" style={{ marginBottom: 0, gap: 5 }}>
              <span className="admin-label">Max ₹</span>
              <input className="input" type="number" name="priceMax" step="0.01" min="0" placeholder="—" defaultValue={svc.priceMax != null ? svc.priceMax / 100 : ""} disabled={pending} />
            </label>
            <label className="form-row" style={{ marginBottom: 0, gap: 5 }}>
              <span className="admin-label">Price label</span>
              <input className="input" name="priceLabel" placeholder="₹18/SK" defaultValue={svc.priceLabel ?? ""} disabled={pending} />
            </label>
            <label className="form-row" style={{ marginBottom: 0, gap: 5 }}>
              <span className="admin-label">Order</span>
              <input className="input" type="number" name="sortOrder" defaultValue={svc.sortOrder} disabled={pending} />
            </label>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: "0.8rem" }}>
              <label className="flex items-center gap-1.5"><input type="checkbox" name="combo" defaultChecked={svc.combo} disabled={pending} /> Combo</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" name="popular" defaultChecked={svc.popular} disabled={pending} /> Popular</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" name="highlight" defaultChecked={svc.highlight} disabled={pending} /> Highlight</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" name="active" defaultChecked={svc.active} disabled={pending} /> Active</label>
            </div>
            <button type="submit" className="btn-admin primary" disabled={pending}>
              {pending ? <Spinner /> : "Save"}
            </button>
          </div>
        )}
      </ActionForm>
    </div>
  );
}