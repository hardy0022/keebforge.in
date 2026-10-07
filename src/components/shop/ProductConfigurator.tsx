"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addToCart } from "@/app/actions/cart";
import { formatINR } from "@/lib/utils/money";
import {
  defaultOptionId,
  optionControlKind,
  selectionModeOf,
  sumSelectedAddons,
  type OptionGroupLike,
} from "@/lib/catalog/product-options";
import CartIcon from "@/components/icons/cart-icon";
import type { AnimatedIconHandle } from "@/components/icons/types";

/**
 * Configurator for products with admin-defined option groups
 * (ProductOptionGroup / ProductOption). Price = base + Σ addons; the server
 * action recomputes it from live data on submit.
 *
 * SINGLE groups render as radio cards; the base option of every required SINGLE
 * group is auto-selected on mount so the product is immediately purchasable.
 * MULTIPLE groups render as checkbox cards — zero or more, at least one when
 * required — and never auto-select, so the customer's accessories are their own
 * choice.
 *
 * `selectionMode` is a property of each group (e.g. an "Accessories" group can
 * be MULTIPLE); nothing here keyed off a group name or product type.
 */
export function ProductConfigurator({
  productId,
  groups,
  basePrice,
  baseAvailable,
  madeToOrder = false,
}: {
  productId: string;
  groups: OptionGroupLike[];
  basePrice: number;
  baseAvailable: number;
  madeToOrder?: boolean;
}) {
  const router = useRouter();
  const active = groups.filter((g) => g.enabled);
  const [picks, setPicks] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const g of active) {
      if (selectionModeOf(g) === "SINGLE" && g.required) {
        const def = defaultOptionId(g);
        init[g.id] = def ? [def] : [];
      } else {
        init[g.id] = [];
      }
    }
    return init;
  });
  const [qty, setQty] = useState(1);
  const [buyNow, setBuyNow] = useState(false);
  const [state, action, pending] = useActionState(addToCart, null);
  const cartIconRef = useRef<AnimatedIconHandle>(null);
  const prevPendingRef = useRef(pending);
  const added = state?.ok === true && !pending;
  useEffect(() => {
    if (prevPendingRef.current && !pending && state?.ok) {
      window.dispatchEvent(new Event("kf-cart-changed"));
      window.dispatchEvent(
        new CustomEvent("kf-cart-added", {
          detail: { count: state.count ?? 0 },
        }),
      );
    }
    prevPendingRef.current = pending;
  }, [pending, state]);

  const complete = active.every(
    (g) => !g.required || (picks[g.id]?.length ?? 0) > 0,
  );
  const optionIds = active.flatMap((g) => picks[g.id] ?? []);
  const configuredPrice = basePrice + sumSelectedAddons(active, optionIds);
  const out = baseAvailable <= 0;

  const toggle = (g: OptionGroupLike, optionId: string) => {
    setPicks((p) => {
      const current = p[g.id] ?? [];
      if (selectionModeOf(g) === "MULTIPLE") {
        const next = current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
        return { ...p, [g.id]: next };
      }
      return { ...p, [g.id]: [optionId] };
    });
    // Only SINGLE picks reset quantity — the pre-existing radio behaviour.
    if (selectionModeOf(g) === "SINGLE") setQty(1);
  };

  const makeAvailabilityText = () => {
    if (out) return "Out of stock";
    if (madeToOrder) return "Made to order — we build it after you order.";
    if (baseAvailable <= 3)
      return `Only ${baseAvailable} left in stock — order soon.`;
    return "In stock";
  };

  useEffect(() => {
    if (state?.ok && buyNow) router.push("/shop/checkout");
  }, [state, buyNow, router]);

  return (
    <form action={action} className="product-buy-form">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="quantity" value={qty} />
      <input type="hidden" name="optionIds" value={JSON.stringify(optionIds)} />

      <div className="product-price-section">
        <div className="product-price">
          <span className="product-price-amount">
            {formatINR(configuredPrice)}
          </span>
        </div>
      </div>

      <div className="option-groups">
        {active.map((g) => {
          const multi = optionControlKind(g) === "checkbox";
          const selected = picks[g.id] ?? [];
          return (
            <fieldset className="product-optgroup" key={g.id}>
              <legend className="product-optgroup-head">
                <span className="product-option-label">{g.name}</span>
              </legend>
              <div
                className="option-cards"
                role={multi ? "group" : "radiogroup"}
                aria-label={g.name}
              >
                {g.options
                  .filter((o) => o.enabled)
                  .map((o) => {
                    const isSelected = selected.includes(o.id);
                    const isBase = o.priceAddon === 0;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role={multi ? "checkbox" : "radio"}
                        aria-checked={isSelected}
                        className={`option-card${isSelected ? " selected" : ""}`}
                        onClick={() => toggle(g, o.id)}
                      >
                        <span
                          className={
                            multi
                              ? "option-card-checkbox"
                              : "option-card-radio"
                          }
                          aria-hidden="true"
                        >
                          {isSelected && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          )}
                        </span>
                        <span className="option-card-body">
                          <span className="option-card-name">{o.name}</span>
                          <span
                            className={`option-card-price${isBase ? " base" : ""}`}
                          >
                            {isBase ? "Base" : `+${formatINR(o.priceAddon)}`}
                          </span>
                        </span>
                      </button>
                    );
                  })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="product-buy-actions">
        <button
          type="submit"
          className={`btn-prime btn-prime-lg product-buy-btn${added && !buyNow ? " product-buy-btn-added" : ""}`}
          disabled={pending || out || !complete || (added && !buyNow)}
          onClick={() => setBuyNow(false)}
          onMouseEnter={() => cartIconRef.current?.startAnimation()}
          onMouseLeave={() => cartIconRef.current?.stopAnimation()}
        >
          {!(added && !buyNow) && !out && (
            <CartIcon ref={cartIconRef} size={16} strokeWidth={1.8} />
          )}
          {out
            ? "Out of Stock"
            : added && !buyNow
              ? "✓ Added"
              : pending
                ? "Adding…"
                : "Add to Cart"}
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

      <p className="product-availability" role="note">
        <span
          className={`product-availability-dot${out ? " out" : ""}`}
          aria-hidden="true"
        />
        {makeAvailabilityText()}
      </p>

      {state?.error && (
        <p className="text-sm text-[var(--err)]" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
