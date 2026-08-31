"use client";

import { useActionState } from "react";
import { updateServicePrice } from "@/app/admin/actions/services";
import { Spinner } from "@/components/admin/ActionForm";

type Prop = {
  id: string;
  unit: string;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  priceLabel: string | null;
};

const isRange = (p: Prop) => p.priceMin != null || p.priceMax != null;

function toRs(paise: number | null): string {
  return paise == null ? "" : String(paise / 100);
}

export function ServicePriceInline({ svc }: { svc: Prop }) {
  const [state, formAction, pending] = useActionState(updateServicePrice, {});

  if (svc.unit === "QUOTE") {
    return (
      <span className="muted" style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>Quote — priced offline</span>
    );
  }

  return (
    <form action={formAction} className="mods-editor">
      <input type="hidden" name="id" value={svc.id} />
      {isRange(svc) ? (
        <>
          <label className="mods-field">
            <span className="mods-field-label">Min ₹</span>
            <input className="input" name="priceMin" type="number" step="0.01" min="0" placeholder="Min" defaultValue={toRs(svc.priceMin)} disabled={pending} />
          </label>
          <label className="mods-field">
            <span className="mods-field-label">Max ₹</span>
            <input className="input" name="priceMax" type="number" step="0.01" min="0" placeholder="Max" defaultValue={toRs(svc.priceMax)} disabled={pending} />
          </label>
        </>
      ) : (
        <label className="mods-field">
          <span className="mods-field-label">Price ₹</span>
          <input className="input" name="price" type="number" step="0.01" min="0" placeholder="0" defaultValue={toRs(svc.price)} disabled={pending} />
        </label>
      )}
      <label className="mods-field wide">
        <span className="mods-field-label">Label</span>
        <input className="input" name="priceLabel" type="text" placeholder="₹18/SK" defaultValue={svc.priceLabel ?? ""} disabled={pending} />
      </label>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        {state.ok ? (
          <span style={{ fontSize: "0.66rem", color: "var(--ok)" }}>✓ Saved</span>
        ) : state.error ? (
          <span style={{ fontSize: "0.66rem", color: "var(--err)" }}>{state.error}</span>
        ) : (
          <span style={{ fontSize: "0.66rem" }}>&nbsp;</span>
        )}
        <button className="btn-admin sm primary" type="submit" disabled={pending}>
          {pending ? <Spinner /> : "Save"}
        </button>
      </div>
    </form>
  );
}
