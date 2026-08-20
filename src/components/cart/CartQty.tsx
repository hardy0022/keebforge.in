"use client";

import { useActionState } from "react";
import { updateCartItem } from "@/app/actions/cart";

export function CartQty({ itemId, quantity, available }: { itemId: string; quantity: number; available: number }) {
  const [state, action, pending] = useActionState(updateCartItem, null);

  const submit = (q: number) => {
    const fd = new FormData();
    fd.set("itemId", itemId);
    fd.set("quantity", String(Math.max(1, Math.min(available, q))));
    action(fd);
  };

  return (
    <div className="cart-qty">
      <button type="button" aria-label="Decrease quantity" disabled={pending || quantity <= 1} onClick={() => submit(quantity - 1)}>
        −
      </button>
      <span>{quantity}</span>
      <button type="button" aria-label="Increase quantity" disabled={pending || quantity >= available} onClick={() => submit(quantity + 1)}>
        +
      </button>
      {state?.error && <span className="text-xs text-[var(--err)]">{state.error}</span>}
    </div>
  );
}