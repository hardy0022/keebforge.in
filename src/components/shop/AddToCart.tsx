"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addToCart } from "@/app/actions/cart";

type VariantProp = {
  id: string;
  name: string;
  price: number | null;
  compareAtPrice: number | null;
  stock: number;
  reservedQuantity: number;
  options?: Record<string, string> | null;
};

const labelize = (k: string) => k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/* Option groups are derived entirely from variant.options JSON (e.g. {"case color": "Black"})
   so any product's configuration surfaces automatically. Empty → legacy dropdown mode. */
function buildGroups(variants: VariantProp[]) {
  if (!variants.length || variants.some((v) => !v.options || Object.keys(v.options).length === 0)) return [];
  const order: string[] = [];
  const values = new Map<string, Set<string>>();
  for (const v of variants) {
    for (const [k, val] of Object.entries(v.options!)) {
      if (typeof val !== "string") continue;
      if (!values.has(k)) {
        values.set(k, new Set());
        order.push(k);
      }
      values.get(k)!.add(val);
    }
  }
  return order.map((k) => ({ name: k, label: labelize(k), values: [...values.get(k)!] }));
}

export function AddToCart({
  productId,
  variants,
  baseAvailable,
}: {
  productId: string;
  variants: VariantProp[];
  baseAvailable: number;
}) {
  const router = useRouter();
  const groups = useMemo(() => buildGroups(variants), [variants]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState(1);
  const [buyNow, setBuyNow] = useState(false);
  const [state, action, pending] = useActionState(addToCart, null);

  const matches = (v: VariantProp, picks: Record<string, string>) =>
    Object.entries(picks).every(([k, val]) => !val || v.options?.[k] === val);
  const complete =
    groups.length > 0 && groups.every((g) => selectedOptions[g.name]);
  const selected =
    groups.length > 0
      ? complete
        ? (variants.find((v) => matches(v, selectedOptions)) ?? null)
        : null
      : (variants.find((v) => v.id === variantId) ?? null);

  const available = selected ? Math.max(0, selected.stock - selected.reservedQuantity) : baseAvailable;
  const out = available <= 0;

  useEffect(() => {
    if (state?.ok && buyNow) router.push("/shop/checkout");
  }, [state, buyNow, router]);

  const valueEnabled = (group: string, value: string) =>
    variants.some((v) =>
      v.options?.[group] === value &&
      Object.entries(selectedOptions).every(([k, val]) => k === group || !val || v.options?.[k] === val)
    );

  return (
    <form action={action} className="product-buy-form">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value={selected?.id ?? ""} />
      <input type="hidden" name="quantity" value={qty} />

      {groups.length > 0 ? (
        <div className="option-groups">
          {groups.map((g) => (
            <div key={g.name}>
              <span className="product-option-label">
                {g.label}
                {selectedOptions[g.name] ? <em>: {selectedOptions[g.name]}</em> : <em> — select one</em>}
              </span>
              <div className="option-pills" role="radiogroup" aria-label={g.label}>
                {g.values.map((value) => {
                  const active = selectedOptions[g.name] === value;
                  const enabled = valueEnabled(g.name, value);
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={!enabled}
                      className={`option-pill${active ? " selected" : ""}`}
                      onClick={() => {
                        const next = { ...selectedOptions, [g.name]: value };
                        setSelectedOptions(next);
                        setQty(1);
                      }}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!complete && (
            <p className="text-sm text-[var(--t3)]">Pick an option for every field to continue.</p>
          )}
        </div>
      ) : (
        variants.length > 0 && (
          <label className="flex flex-col gap-2">
            <span className="text-[0.72rem] uppercase tracking-[0.14em] text-[var(--t3)]">Variant</span>
            <select
              value={variantId}
              onChange={(e) => {
                setVariantId(e.target.value);
                setQty(1);
              }}
              className="shop-select"
            >
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        )
      )}

      <div className="product-buy-actions">
          <button
            type="submit"
            className="btn-prime btn-prime-lg product-buy-btn"
            disabled={pending || out || (groups.length > 0 && !complete)}
            onClick={() => setBuyNow(false)}
          >
            {out ? "Out of Stock" : pending ? "Adding…" : "Add to Cart"}
          </button>
          {!out && (
            <button
              type="submit"
              className="btn-ghost product-buynow-btn"
              disabled={pending || (groups.length > 0 && !complete)}
              onClick={() => setBuyNow(true)}
            >
              Buy Now
            </button>
          )}
        </div>

      {state?.error && <p className="text-sm text-[var(--err)]">{state.error}</p>}
      {state?.ok && !buyNow && (
        <p className="text-sm text-[var(--ok)]">
          Added to cart{state.count != null ? ` — ${state.count} item${state.count === 1 ? "" : "s"} in cart` : ""}.
        </p>
      )}
    </form>
  );
}
