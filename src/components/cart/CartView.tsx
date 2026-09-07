"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { updateCartItem, removeCartItem } from "@/app/actions/cart";
import TrashIcon from "@/components/icons/trash-icon";
import { formatINR } from "@/lib/utils/money";

export type CartSelection = {
  optionId: string;
  groupName: string;
  optionName: string;
  addon: number;
};

export type CartRow = {
  id: string;
  name: string;
  slug: string;
  brand?: string | null;
  variantName?: string | null;
  productType: string;
  selections: CartSelection[];
  image?: { url: string; alt?: string | null } | null;
  unitPrice: number;
  available: number;
  quantity: number;
};

export function CartView({ rows }: { rows: CartRow[] }) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.quantity])),
  );
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Refs mirror state for synchronous reads inside event handlers (avoid stale
  // closures); render always reads the state values above.
  const qtyRef = useRef(quantities);
  const confirmedRef = useRef<Record<string, number>>(
    Object.fromEntries(rows.map((r) => [r.id, r.quantity])),
  );
  const removedRef = useRef<ReadonlySet<string>>(new Set());

  // Serialize mutations per item so rapid/out-of-order clicks can't race.
  const queue = useRef(new Map<string, Promise<void>>());
  const enqueue = useCallback((id: string, fn: () => Promise<void>) => {
    const prev = queue.current.get(id) ?? Promise.resolve();
    const next = prev
      .then(fn)
      .finally(() => {
        if (queue.current.get(id) === next) queue.current.delete(id);
      });
    queue.current.set(id, next);
  }, []);

  const bump = useCallback(
    (row: CartRow, delta: number) => {
      const current = qtyRef.current[row.id] ?? row.quantity;
      const desired = Math.max(1, Math.min(row.available, current + delta));
      if (desired === current) return;
      setErrors((e) => ({ ...e, [row.id]: "" }));
      qtyRef.current = { ...qtyRef.current, [row.id]: desired };
      setQuantities(qtyRef.current);

      enqueue(row.id, async () => {
        setPending((p) => ({ ...p, [row.id]: true }));
        const fd = new FormData();
        fd.set("itemId", row.id);
        fd.set("quantity", String(desired));
        const res = await updateCartItem(null, fd);
        if (res?.error) {
          const fallback = confirmedRef.current[row.id] ?? row.quantity;
          qtyRef.current = { ...qtyRef.current, [row.id]: fallback };
          setQuantities(qtyRef.current);
          setErrors((e) => ({ ...e, [row.id]: res.error ?? "" }));
        } else if (res?.ok) {
          if (typeof res.quantity === "number")
            confirmedRef.current[row.id] = res.quantity;
          const next = res.quantity ?? desired;
          qtyRef.current = { ...qtyRef.current, [row.id]: next };
          setQuantities(qtyRef.current);
          window.dispatchEvent(new Event("kf-cart-changed"));
        }
        setPending((p) => ({ ...p, [row.id]: false }));
      });
    },
    [enqueue],
  );

  const remove = useCallback(
    (row: CartRow) => {
      const next = new Set(removedRef.current);
      next.add(row.id);
      removedRef.current = next;
      setRemoved(next);

      enqueue(row.id, async () => {
        const fd = new FormData();
        fd.set("itemId", row.id);
        const res = await removeCartItem(fd);
        if (res?.error) {
          const rollback = new Set(removedRef.current);
          rollback.delete(row.id);
          removedRef.current = rollback;
          setRemoved(rollback);
          setErrors((e) => ({ ...e, [row.id]: res.error ?? "" }));
        } else {
          window.dispatchEvent(new Event("kf-cart-changed"));
        }
      });
    },
    [enqueue],
  );

  const visible = rows.filter((r) => !removed.has(r.id));
  const subtotal = visible.reduce(
    (s, r) =>
      s +
      (r.productType === "CUSTOM"
        ? r.unitPrice
        : r.unitPrice * (quantities[r.id] ?? r.quantity)),
    0,
  );

  if (visible.length === 0) {
    return (
      <div className="cart-empty">
        <h2>Your cart is currently empty.</h2>
        <Link href="/shop" className="btn-prime">
          Continue Shopping <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="cart-layout">
      <div className="cart-list">
        <div className="cart-col-headings">
          <span className="cart-col-product">Product</span>
          <span className="cart-col-qty">Quantity</span>
          <span className="cart-col-total">Total</span>
        </div>

        {visible.map((row) => {
          const qty = quantities[row.id] ?? row.quantity;
          const lineTotal =
            row.productType === "CUSTOM"
              ? row.unitPrice
              : row.unitPrice * qty;
          const error = errors[row.id];
          const busy = pending[row.id];
          return (
            <article key={row.id} className="cart-row">
              <div className="cart-row-product">
                {row.image && (
                  <div className="cart-row-img">
                    <Image
                      src={row.image.url}
                      alt={row.image.alt ?? row.name}
                      fill
                      sizes="100px"
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="cart-row-details">
                  <Link href={`/product/${row.slug}`} className="cart-row-name">
                    {row.name}
                  </Link>
                  {row.brand && <p className="cart-row-brand">{row.brand}</p>}
                  {row.variantName && (
                    <p className="cart-row-meta">{row.variantName}</p>
                  )}
                  {row.selections.length > 0 && (
                    <div className="cart-row-options">
                      {row.selections.map((s) => (
                        <span key={s.optionId} className="cart-row-option">
                          {s.groupName}: {s.optionName}
                          {s.addon > 0 && (
                            <span className="cart-row-addon">
                              {" "}
                              (+{formatINR(s.addon)})
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="cart-row-qty">
                {row.productType === "CUSTOM" ? (
                  <span className="cart-qty-static">1</span>
                ) : (
                  <div className="cart-qty">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      disabled={busy || qty <= 1}
                      onClick={() => bump(row, -1)}
                    >
                      −
                    </button>
                    <span>{qty}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      disabled={busy || qty >= row.available}
                      onClick={() => bump(row, 1)}
                    >
                      +
                    </button>
                    {error && (
                      <span className="text-xs text-[var(--err)]">{error}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="cart-row-total">
                <span className="cart-row-price">{formatINR(lineTotal)}</span>
                <button
                  type="button"
                  className="cart-remove-btn"
                  aria-label={`Remove ${row.name} from cart`}
                  onClick={() => remove(row)}
                >
                  <TrashIcon
                    size={14}
                    dangerHover
                    className="cart-remove-icon"
                    aria-hidden
                  />
                  Remove
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <aside className="cart-summary">
        <h2 className="cart-summary-title">Order Summary</h2>

        <div className="cart-summary-row">
          <span>Products subtotal</span>
          <span>{formatINR(subtotal)}</span>
        </div>

        <div className="cart-summary-row cart-summary-shipping">
          <span>Shipping</span>
          <span>At checkout</span>
        </div>

        <div className="cart-summary-divider" />

        <div className="cart-summary-row cart-summary-total">
          <span>Total</span>
          <span className="cart-summary-total-amount">{formatINR(subtotal)}</span>
        </div>

        <p className="cart-summary-note">
          * Final total including shipping will be calculated at checkout.
        </p>

        <Link href="/shop/checkout" className="btn-prime w-full justify-center">
          Continue to Checkout <span aria-hidden="true">&rarr;</span>
        </Link>
        <Link href="/shop" className="btn-ghost w-full justify-center mt-2">
          Keep Shopping
        </Link>
      </aside>
    </div>
  );
}
