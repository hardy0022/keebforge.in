"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type CartAddedPayload = { count?: number };

/**
 * Small non-blocking "Added to cart" confirmation. Fired by the add-to-cart
 * components via the `kf-cart-added` CustomEvent (same pattern as the
 * existing `kf-cart-changed` badge sync). Renders once, bottom-center, and
 * auto-dismisses. Never blocks scroll or interaction on the page.
 */
export function CartToaster() {
  const [toast, setToast] = useState<{ id: number; count?: number } | null>(
    null,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onAdd = (e: Event) => {
      const detail = (e as CustomEvent<CartAddedPayload>).detail ?? {};
      const next = { id: Date.now(), count: detail.count };
      setToast(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), 4000);
    };
    window.addEventListener("kf-cart-added", onAdd);
    return () => {
      window.removeEventListener("kf-cart-added", onAdd);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!toast) return null;

  return (
    <div className="cart-toaster" role="status" aria-live="polite">
      <p className="cart-toaster-msg">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
        Added to cart
        {toast.count != null ? ` — ${toast.count} in cart` : ""}
      </p>
      <div className="cart-toaster-actions">
        <Link href="/shop/cart" className="cart-toaster-view">
          View Cart
        </Link>
        <button
          type="button"
          className="cart-toaster-close"
          onClick={() => setToast(null)}
          aria-label="Dismiss notification"
        >
          Continue
        </button>
      </div>
    </div>
  );
}