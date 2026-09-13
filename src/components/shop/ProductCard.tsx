import Link from "next/link";
import type { ShopProduct } from "@/lib/catalog/data";
import { formatINR } from "@/lib/utils/money";
import { isPurchasable, CONDITION_LABELS, MAX_CARD_FEATURES } from "@/lib/catalog/shop";
import { CardAddToCart } from "@/components/shop/CardAddToCart";
import { CardIcon, type ProductCardFeature } from "@/components/ui/CardIcons";
import { ImageCycler } from "@/components/shop/ImageCycler";

export function ProductCard({ product }: { product: ShopProduct }) {
  const images = product.images;
  const count = images.length;
  const compareAt = product.compareAtPrice;
  const buyable = isPurchasable(product);
  const feats = (
    Array.isArray(product.cardFeatures) ? product.cardFeatures : []
  ).slice(0, MAX_CARD_FEATURES) as ProductCardFeature[];

  // Price can vary when the customer picks between variants or add-ons, or the
  // product is made to order — mirror the detail page's "From" semantics.
  const variantPrices = product.variants.map((v) => v.price ?? product.price);
  const variableConfig =
    product.variants.length > 1 ||
    new Set(variantPrices).size > 1 ||
    product.optionGroups.some(
      (g) => g.enabled && g.options.some((o) => o.enabled && o.priceAddon > 0),
    );
  const fromPrice = product.productType === "CUSTOM" || variableConfig;

  // Compare-at only surfaces for a genuinely single-price product (never next to "From").
  const showCompareAt =
    !fromPrice && compareAt != null && compareAt > product.price;

  // Small section marker above the title: custom/clearance communicate themselves, NEW stays quiet.
  const kicker =
    product.productType === "CUSTOM"
      ? "Custom Order"
      : product.productType === "CLEARANCE"
        ? (product.condition && CONDITION_LABELS[product.condition]) ||
          "Clearance"
        : null;

  return (
    <article
      className={`shop-card${buyable ? "" : " shop-card--unavailable"}`}
    >
      {count > 0 ? (
        <ImageCycler images={images} name={product.name} slug={product.slug} />
      ) : (
        <span className="shop-card-fallback" aria-hidden="true">
          {product.name.charAt(0)}
        </span>
      )}
      <div className="shop-card-body">
        {kicker && (
          <span
            className={`shop-card-kicker${product.productType === "CUSTOM" ? " acc" : ""}`}
          >
            {kicker}
          </span>
        )}
        <h3 className="shop-card-title">
          <Link href={`/product/${product.slug}`}>{product.name}</Link>
        </h3>
        <div className="shop-card-foot">
          <div className="shop-card-pricing">
            <span className="shop-card-price">
              {fromPrice && (
                <span className="shop-card-price-from">From&nbsp;</span>
              )}
              {formatINR(product.price)}
              {showCompareAt && (
                <span className="shop-card-price-was">
                  {formatINR(compareAt!)}
                </span>
              )}
            </span>
          </div>
          <CardAddToCart productId={product.id} disabled={!buyable} />
        </div>
      </div>
      {feats.length > 0 && (
        <div className="shop-card-specs">
          {feats.map((f, i) => (
            <div key={`${f.label}-${i}`} className="shop-spec">
              <span className="shop-spec-icon">
                <CardIcon name={f.icon} />
              </span>
              <span className="shop-spec-name">{f.label}</span>
              <span className="shop-spec-val">{f.value}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
