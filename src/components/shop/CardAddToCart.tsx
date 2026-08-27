"use client";

import { useActionState, useEffect } from "react";
import { addToCart } from "@/app/actions/cart";

export function CardAddToCart({ productId, disabled }: { productId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(addToCart, null);

  useEffect(() => {
    if (state?.ok) window.dispatchEvent(new Event("kf-cart-changed"));
  }, [state]);

  return (
    <form action={action} className="shop-card-atc">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value="" />
      <input type="hidden" name="quantity" value="1" />
      <button
        type="submit"
        className="shop-card-atc-btn"
        disabled={pending || disabled}
        title={disabled ? "Out of stock" : "Add to cart"}
        aria-label={disabled ? "Out of stock" : "Add to cart"}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="9" cy="21" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="19" cy="21" r="1.4" fill="currentColor" stroke="none" />
          <path d="M2 3h3l2.6 12.5a2 2 0 0 0 2 1.5h8.7a2 2 0 0 0 2-1.6L22 7H6" />
        </svg>
      </button>
      {state?.error && (
        <p className="shop-card-atc-err" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
