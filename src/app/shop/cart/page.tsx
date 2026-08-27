import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { CartQty } from "@/components/cart/CartQty";
import { buildMetadata } from "@/lib/seo";
import { getCartWithItems, availableQuantity } from "@/lib/cart";
import { resolveConfiguredPrice, type ProductConfigSnapshot } from "@/lib/product-options";
import { formatINR } from "@/lib/money";
import { removeCartItem } from "@/app/actions/cart";

export const metadata: Metadata = buildMetadata({
  title: "Your Cart | KeebForge",
  description: "Review your KeebForge cart before checkout.",
  path: "/shop/cart",
});

export default async function ShopCartPage() {
  const cart = await getCartWithItems();
  const items = cart?.items ?? [];

  const rows = items.map((item) => {
    const cfg = item.config as ProductConfigSnapshot | null;
    const resolved =
      cfg?.kind === "options"
        ? resolveConfiguredPrice(item.product.optionGroups, item.product.price, cfg.optionIds)
        : null;
    const unitPrice = resolved?.ok ? resolved.unitPrice : item.variant?.price ?? item.product.price;
    const selections = cfg?.kind === "options" ? (resolved?.ok ? resolved.selections : cfg.selections) : [];
    const compareAt = item.variant?.compareAtPrice ?? item.product.compareAtPrice;
    const available = item.variant
      ? availableQuantity(item.variant.stock, item.variant.reservedQuantity)
      : availableQuantity(item.product.stock, item.product.reservedQuantity);
    const image = item.product.images[0];
    return { item, unitPrice, compareAt, available, image, lineTotal: unitPrice * item.quantity, selections };
  });
  const subtotal = rows.reduce((s, r) => s + r.lineTotal, 0);

  return (
    <main>
      <section className="pt-[calc(var(--nav-h)+40px)] pb-8">
        <div className="wrap">
          {/* ── Header row ── */}
          <div className="cart-header">
            <h1 className="sec-title mb-0">Your Cart</h1>
            <Link href="/shop" className="cart-continue-link">
              Continue Shopping <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>
          <p className="sec-desc">Items in your cart. Prices are recalculated against live inventory at checkout.</p>
        </div>
      </section>

      <section className="svc-section pt-0">
        <div className="wrap">
          {rows.length === 0 ? (
            /* ── Empty state ── */
            <div className="cart-empty">
              <h2>Your cart is currently empty.</h2>
              <Link href="/shop" className="btn-prime">
                Continue Shopping <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          ) : (
            /* ── Two-column layout ── */
            <div className="cart-layout">
              {/* ── Left: Product list ── */}
              <div className="cart-list">
                {/* ── Column headings ── */}
                <div className="cart-col-headings">
                  <span className="cart-col-product">Product</span>
                  <span className="cart-col-qty">Quantity</span>
                  <span className="cart-col-total">Total</span>
                </div>

                {/* ── Product rows ── */}
                {rows.map(({ item, unitPrice, compareAt, available, image, lineTotal, selections }) => (
                  <article key={item.id} className="cart-row">
                    <div className="cart-row-product">
                      {image && (
                        <div className="cart-row-img">
                          <Image src={image.url} alt={image.alt ?? item.product.name} fill sizes="100px" className="object-cover" />
                        </div>
                      )}
                      <div className="cart-row-details">
                        <Link href={`/product/${item.product.slug}`} className="cart-row-name">
                          {item.product.name}
                        </Link>
                        {item.product.brand && <p className="cart-row-brand">{item.product.brand.name}</p>}
                        {item.variant && <p className="cart-row-meta">{item.variant.name}</p>}
                        {selections.length > 0 && (
                          <div className="cart-row-options">
                            {selections.map((s) => (
                              <span key={s.optionId} className="cart-row-option">
                                {s.groupName}: {s.optionName}
                                {s.addon > 0 && <span className="cart-row-addon"> (+{formatINR(s.addon)})</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="cart-row-qty">
                      <CartQty itemId={item.id} quantity={item.quantity} available={available} />
                      <form action={removeCartItem}>
                        <input type="hidden" name="itemId" value={item.id} />
                        <button type="submit" className="cart-remove-btn" aria-label={`Remove ${item.product.name}`}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </form>
                    </div>

                    <div className="cart-row-total">
                      <span className="cart-row-price">{formatINR(lineTotal)}</span>
                      {compareAt != null && compareAt > unitPrice && (
                        <span className="cart-row-compare">{formatINR(compareAt)}</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              {/* ── Right: Order Summary ── */}
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
          )}
        </div>
      </section>
    </main>
  );
}
