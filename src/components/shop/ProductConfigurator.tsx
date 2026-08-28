"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addToCart } from "@/app/actions/cart";
import { formatINR } from "@/lib/money";
import { defaultOptionId, type OptionGroupLike } from "@/lib/product-options";
import CartIcon from "@/components/icons/cart-icon";
import type { AnimatedIconHandle } from "@/components/icons/types";

/**
 * Configurator for products with admin-defined option groups
 * (ProductOptionGroup / ProductOption). Price = base + Σ addons; the server
 * action recomputes it from live data on submit.
 *
 * The base option of every required group is selected automatically on mount,
 * so the product is immediately purchasable and the price reflects it, without
 * the customer having to pick the default manually.
 */
export function ProductConfigurator({
  productId,
  groups,
  baseAvailable,
}: {
  productId: string;
  groups: OptionGroupLike[];
  baseAvailable: number;
}) {
  const router = useRouter();
  const active = groups.filter((g) => g.enabled);
  const [picks, setPicks] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const g of active) {
      if (g.required) {
        const def = defaultOptionId(g);
        if (def) init[g.id] = def;
      }
    }
    return init;
  });
  const [qty, setQty] = useState(1);
  const [buyNow, setBuyNow] = useState(false);
  const [state, action, pending] = useActionState(addToCart, null);
  const cartIconRef = useRef<AnimatedIconHandle>(null);

  const complete = active.every((g) => !g.required || picks[g.id]);
  const optionIds = Object.values(picks);
  const out = baseAvailable <= 0;

  useEffect(() => {
    if (state?.ok && buyNow) router.push("/shop/checkout");
  }, [state, buyNow, router]);

  return (
    <form action={action} className="product-buy-form">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="quantity" value={qty} />
      <input type="hidden" name="optionIds" value={JSON.stringify(optionIds)} />

      <div className="option-groups">
        {active.map((g) => (
          <fieldset className="product-optgroup" key={g.id}>
            <legend className="product-optgroup-head">
              <span className="product-option-label">{g.name}</span>
            </legend>
            <div className="option-cards" role="radiogroup" aria-label={g.name}>
              {g.options
                .filter((o) => o.enabled)
                .map((o) => {
                  const selected = picks[g.id] === o.id;
                  const isBase = o.priceAddon === 0;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`option-card${selected ? " selected" : ""}`}
                      onClick={() => {
                        setPicks((p) => ({ ...p, [g.id]: o.id }));
                        setQty(1);
                      }}
                    >
                      <span className="option-card-radio" aria-hidden="true">
                        {selected && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </span>
                      <span className="option-card-body">
                        <span className="option-card-name">{o.name}</span>
                        <span className={`option-card-price${isBase ? " base" : ""}`}>
                          {isBase ? "Base" : `+${formatINR(o.priceAddon)}`}
                        </span>
                      </span>
                    </button>
                  );
                })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="product-buy-actions">
          <button
            type="submit"
            className="btn-prime btn-prime-lg product-buy-btn"
            disabled={pending || out || !complete}
            onClick={() => setBuyNow(false)}
            onMouseEnter={() => cartIconRef.current?.startAnimation()}
            onMouseLeave={() => cartIconRef.current?.stopAnimation()}
          >
            {!out && <CartIcon ref={cartIconRef} size={16} strokeWidth={1.8} />}
            {out ? "Out of Stock" : pending ? "Adding…" : "Add to Cart"}
          </button>
          {!out && (
            <button
              type="submit"
              className="btn-ghost product-buynow-btn"
              disabled={pending || !complete}
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
