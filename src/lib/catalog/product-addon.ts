/**
 * Single optional product add-on resolution.
 *
 * The add-on is a per-product boolean choice, not a configurable option. The
 * browser may only say "selected"; title, description and price always come
 * from the live product row. Disabled add-ons, and add-ons without a title,
 * are not purchasable even if a crafted request sets the flag.
 */

export type ProductAddonSettings = {
  addonEnabled: boolean;
  addonTitle: string | null;
  addonDescription?: string | null;
  addonPrice?: number | null;
};

export type ResolvedProductAddon = {
  selected: boolean;
  title: string | null;
  description: string | null;
  price: number;
};

const NOT_SELECTED: ResolvedProductAddon = {
  selected: false,
  title: null,
  description: null,
  price: 0,
};

/** Resolve the customer's selection against live product data (paise). */
export function resolveProductAddon(
  product: Partial<ProductAddonSettings> | null | undefined,
  requested: boolean,
): ResolvedProductAddon {
  if (!product) return NOT_SELECTED;
  const title = (product.addonTitle ?? "").trim() || null;
  if (!requested || !product.addonEnabled || !title) return NOT_SELECTED;

  const rawPrice = product.addonPrice ?? 0;
  const price =
    typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice > 0
      ? Math.round(rawPrice)
      : 0;

  return {
    selected: true,
    title,
    description: (product.addonDescription ?? "").trim() || null,
    price,
  };
}
