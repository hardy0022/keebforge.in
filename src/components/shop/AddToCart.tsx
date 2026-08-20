"use client";

import { useActionState, useState } from "react";
import { addToCart } from "@/app/actions/cart";
import { formatINR } from "@/lib/money";

type VariantProp = { id: string; name: string; price: number | null; compareAtPrice: number | null; stock: number; reservedQuantity: number };

export function AddToCart({
  productId,
  variants,
  basePrice,
  baseCompareAt,
  baseAvailable,
}: {
  productId: string;
  variants: VariantProp[];
  basePrice: number;
  baseCompareAt: number | null;
  baseAvailable: number;
}) {
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState(1);
  const [state, action, pending] = useActionState(addToCart, null);

  const selected = variants.find((v) => v.id === variantId) ?? null;
  const price = selected?.price ?? basePrice;
  const compareAt = selected?.compareAtPrice ?? baseCompareAt;
  const available = selected ? Math.max(0, selected.stock - selected.reservedQuantity) : baseAvailable;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value={selected?.id ?? ""} />
      <input type="hidden" name="quantity" value={qty} />

      {variants.length > 0 && (
        <label className="flex flex-col gap-2">
          <span className="text-[0.72rem] uppercase tracking-[0.14em] text-[var(--t3)]">Variant</span>
          <select
            name="variant"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            className="shop-select"
          >
            <option value="">Select a variant</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} — {formatINR(v.price ?? basePrice)}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex items-baseline gap-3">
        <span className="font-display text-3xl font-bold text-[var(--acc)]">{formatINR(price)}</span>
        {compareAt != null && compareAt > price && (
          <span className="text-base text-[var(--t3)] line-through">{formatINR(compareAt)}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-[var(--t3)]">
          Qty
          <input
            type="number"
            min={1}
            max={Math.max(1, available)}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Math.min(available, Number(e.target.value) || 1)))}
            className="shop-qty"
            disabled={available <= 0}
          />
        </label>
        <button type="submit" className="btn-prime" disabled={pending || available <= 0}>
          {available <= 0 ? "Out of Stock" : pending ? "Adding…" : "Add to Cart"}
        </button>
      </div>

      {state?.error && <p className="text-sm text-[var(--err)]">{state.error}</p>}
      {state?.ok && (
        <p className="text-sm text-[var(--ok)]">
          Added to cart{state.count != null ? ` — ${state.count} item${state.count === 1 ? "" : "s"} in cart` : ""}.
        </p>
      )}

      <p className="text-xs text-[var(--t3)]">
        {available > 0 ? (
          available <= 5 ? (
            <span className="text-[var(--warn)]">Only {available} left in stock.</span>
          ) : (
            "In stock, ships from Jammu & Kashmir."
          )
        ) : (
          "Currently out of stock."
        )}
      </p>
    </form>
  );
}