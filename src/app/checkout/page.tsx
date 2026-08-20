import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/ui/PageHero";
import { buildMetadata } from "@/lib/seo";
import { getCartWithItems } from "@/lib/cart";
import { formatINR } from "@/lib/money";

export const metadata: Metadata = buildMetadata({
  title: "Checkout | KeebForge",
  description: "Complete your KeebForge order.",
  path: "/checkout",
});

export default async function CheckoutPage() {
  const cart = await getCartWithItems();
  const items = cart?.items ?? [];
  const subtotal = items.reduce(
    (s, it) => s + (it.variant?.price ?? it.product.price) * it.quantity,
    0
  );

  return (
    <main>
      <PageHero
        tag="Checkout"
        title="Almost There"
        desc="Secure payment is being enabled at KeebForge. Until then, review your cart below and reach out to place your order."
        pills={["Cart reviewed server-side"]}
      />
      <section className="svc-section">
        <div className="wrap">
          {items.length === 0 ? (
            <div className="card qcard p-10 text-center">
              <p className="ct mb-2">Your cart is empty</p>
              <Link href="/shop" className="btn-prime" style={{ width: "auto", paddingInline: 24, marginTop: 16 }}>
                Go to Shop
              </Link>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_300px] items-start">
              <div className="flex flex-col gap-3">
                {items.map((it) => (
                  <div key={it.id} className="card flex items-center justify-between p-4">
                    <div>
                      <p className="ct">{it.product.name}</p>
                      <p className="text-sm text-[var(--t3)]">
                        {it.variant ? `${it.variant.name} · ` : ""}Qty {it.quantity}
                      </p>
                    </div>
                    <span className="font-display font-bold text-[var(--t1)]">
                      {formatINR((it.variant?.price ?? it.product.price) * it.quantity)}
                    </span>
                  </div>
                ))}
              </div>
              <aside className="card p-5">
                <h2 className="ct mb-4">Order Summary</h2>
                <div className="flex justify-between text-sm text-[var(--t3)] mb-4">
                  <span>Subtotal</span>
                  <span className="text-[var(--t1)]">{formatINR(subtotal)}</span>
                </div>
                <p className="text-xs text-[var(--t3)] mb-4">
                  Online payment launches soon. For now, place your order by reaching out directly.
                </p>
                <Link href="/contact" className="btn-prime w-full">
                  Place Order on Contact
                </Link>
                <Link href="/cart" className="btn-ghost w-full mt-2">
                  Back to Cart
                </Link>
              </aside>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}