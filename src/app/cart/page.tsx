import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { PageHero } from "@/components/ui/PageHero";
import { CartQty } from "@/components/cart/CartQty";
import { buildMetadata } from "@/lib/seo";
import { getCartWithItems, availableQuantity } from "@/lib/cart";
import { formatINR } from "@/lib/money";
import { removeCartItem } from "@/app/actions/cart";

export const metadata: Metadata = buildMetadata({
  title: "Your Cart | KeebForge",
  description: "Review your KeebForge cart before checkout.",
  path: "/cart",
});

export default async function CartPage() {
  const cart = await getCartWithItems();
  const items = cart?.items ?? [];

  const rows = items.map((item) => {
    const unitPrice = item.variant?.price ?? item.product.price;
    const compareAt = item.variant?.compareAtPrice ?? item.product.compareAtPrice;
    const available = item.variant
      ? availableQuantity(item.variant.stock, item.variant.reservedQuantity)
      : availableQuantity(item.product.stock, item.product.reservedQuantity);
    const image = item.product.images[0];
    return { item, unitPrice, compareAt, available, image, lineTotal: unitPrice * item.quantity };
  });
  const subtotal = rows.reduce((s, r) => s + r.lineTotal, 0);

  return (
    <main>
      <PageHero tag="Cart" title="Your Cart" desc="Items in your cart. Prices are recalculated against live inventory at checkout." pills={[]} />

      <section className="svc-section">
        <div className="wrap">
          {rows.length === 0 ? (
            <div className="card qcard p-10 text-center">
              <p className="ct mb-2">Your cart is empty</p>
              <p className="cd">Browse the shop and add something you like.</p>
              <Link href="/shop" className="btn-prime" style={{ width: "auto", paddingInline: 24, marginTop: 16 }}>
                Go to Shop
              </Link>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_300px] items-start">
              <div className="flex flex-col gap-3">
                {rows.map(({ item, unitPrice, compareAt, available, image, lineTotal }) => (
                  <article key={item.id} className="card flex gap-4 p-4">
                    {image && (
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg">
                        <Image src={image.url} alt={image.alt ?? item.product.name} fill sizes="80px" className="object-cover" />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col gap-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link href={`/product/${item.product.slug}`} className="ct hover:text-[var(--acc)]">
                            {item.product.name}
                          </Link>
                          {item.variant && <p className="text-sm text-[var(--t3)]">{item.variant.name}</p>}
                          {item.product.brand && <p className="text-xs text-[var(--t3)]">{item.product.brand.name}</p>}
                        </div>
                        <div className="text-right">
                          <p className="font-display font-bold text-[var(--t1)]">{formatINR(lineTotal)}</p>
                          {compareAt != null && compareAt > unitPrice && (
                            <p className="text-xs text-[var(--t3)] line-through">{formatINR(unitPrice)}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-4">
                        <CartQty itemId={item.id} quantity={item.quantity} available={available} />
                        <form action={removeCartItem}>
                          <input type="hidden" name="itemId" value={item.id} />
                          <button type="submit" className="text-xs text-[var(--t3)] hover:text-[var(--err)]">
                            Remove
                          </button>
                        </form>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <aside className="card p-5 sticky top-24">
                <h2 className="ct mb-4">Order Summary</h2>
                <div className="flex justify-between text-sm text-[var(--t3)] mb-2">
                  <span>Subtotal</span>
                  <span className="text-[var(--t1)]">{formatINR(subtotal)}</span>
                </div>
                <p className="text-xs text-[var(--t3)] mb-4">
                  Shipping, taxes and discounts are calculated at checkout.
                </p>
                <Link href="/checkout" className="btn-prime w-full">
                  Continue to Checkout
                </Link>
                <Link href="/shop" className="btn-ghost w-full mt-2">
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