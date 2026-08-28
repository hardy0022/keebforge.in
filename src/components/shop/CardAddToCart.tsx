"use client";

import { useActionState, useEffect, useRef } from "react";
import { addToCart } from "@/app/actions/cart";
import CartIcon from "@/components/icons/cart-icon";
import type { AnimatedIconHandle } from "@/components/icons/types";

export function CardAddToCart({ productId, disabled }: { productId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(addToCart, null);
  const cartIconRef = useRef<AnimatedIconHandle>(null);

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
        onMouseEnter={() => cartIconRef.current?.startAnimation()}
        onMouseLeave={() => cartIconRef.current?.stopAnimation()}
      >
        {!disabled && <CartIcon ref={cartIconRef} size={17} strokeWidth={2} />}
      </button>
      {state?.error && (
        <p className="shop-card-atc-err" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
