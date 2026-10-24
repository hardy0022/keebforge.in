import type { Metadata } from "next";
import Link from "next/link";
import { CartView, type CartRow } from "@/components/cart/CartView";
import { buildMetadata } from "@/lib/seo";
import { getCartPageView, availableQuantity } from "@/lib/cart";
import {
  resolveConfiguredPrice,
  type ProductConfigSnapshot,
} from "@/lib/catalog/product-options";
import { resolveProductAddon } from "@/lib/catalog/product-addon";

export const metadata: Metadata = buildMetadata({
  title: "Your Cart | KeebForge",
  description: "Review your KeebForge cart before checkout.",
  path: "/shop/cart",
  noIndex: true,
});

export default async function ShopCartPage() {
  const cart = await getCartPageView();
  const items = cart?.items ?? [];

  const rows: CartRow[] = items.map((item) => {
    const cfg = item.config as ProductConfigSnapshot | null;
    const resolved =
      cfg?.kind === "options"
        ? resolveConfiguredPrice(
            item.product.optionGroups,
            item.product.price,
            cfg.optionIds,
          )
        : null;
    const baseUnitPrice = resolved?.ok
      ? resolved.unitPrice
      : (item.variant?.price ?? item.product.price);
    const color = (item as any).colorOption ?? null;
    const secondaryColor = (item as any).secondaryColorOption ?? null;
    const colorAdd =
      (color?.priceAdjustment ?? 0) +
      (secondaryColor?.priceAdjustment ?? 0);
    const addon = resolveProductAddon(item.product, item.addonSelected);
    const unitPrice = baseUnitPrice + colorAdd + addon.price;
    const selections =
      cfg?.kind === "options"
        ? resolved?.ok
          ? resolved.selections
          : cfg.selections
        : [];
    if (color) {
      selections.push({
        optionId: `color:${color.id}`,
        groupId: "color",
        groupName: "Color",
        optionName: color.name,
        addon: color.priceAdjustment ?? 0,
      });
    }
    if (secondaryColor) {
      selections.push({
        optionId: `color:${secondaryColor.id}`,
        groupId: "secondary-color",
        groupName: item.product.secondaryColorHeading?.trim() || "Color",
        optionName: secondaryColor.name,
        addon: secondaryColor.priceAdjustment ?? 0,
      });
    }
    if (addon.selected && addon.title) {
      selections.push({
        optionId: `addon:${item.product.id}`,
        groupId: "addon",
        groupName: "Add-on",
        optionName: addon.title,
        addon: addon.price,
      });
    }
    const available = item.variant
      ? availableQuantity(item.variant.stock, item.variant.reservedQuantity)
      : availableQuantity(item.product.stock, item.product.reservedQuantity);
    const image = item.product.images[0] ?? null;
    return {
      id: item.id,
      name: item.product.name,
      slug: item.product.slug,
      brand: item.product.brand?.name ?? null,
      variantName: item.variant?.name ?? null,
      productType: item.product.productType,
      selections: selections.map((s) => ({
        optionId: s.optionId,
        groupName: s.groupName,
        optionName: s.optionName,
        addon: s.addon,
      })),
      image: image
        ? { url: image.url, alt: image.alt ?? null }
        : null,
      unitPrice,
      available,
      quantity: item.quantity,
    };
  });

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
          <p className="sec-desc">
            Items in your cart. Prices are recalculated against live inventory
            at checkout.
          </p>
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
            <CartView rows={rows} />
          )}
        </div>
      </section>
    </main>
  );
}
