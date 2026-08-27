"use client";

import { useState } from "react";
import Image from "next/image";
import { cldUrl } from "@/lib/cloudinary-url";
import Link from "next/link";
import type { ShopProduct } from "@/lib/data";
import { formatINR } from "@/lib/money";
import { isPurchasable, CONDITION_LABELS, MAX_CARD_FEATURES } from "@/lib/shop";
import { CardAddToCart } from "@/components/shop/CardAddToCart";
import { CardIcon, type ProductCardFeature } from "@/lib/card-icons";

export function ProductCard({ product }: { product: ShopProduct }) {
  const images = product.images;
  const count = images.length;
  const [manual, setManual] = useState<number | null>(null);
  const compareAt = product.compareAtPrice;
  const buyable = isPurchasable(product);
  const feats = (Array.isArray(product.cardFeatures) ? product.cardFeatures : [])
    .slice(0, MAX_CARD_FEATURES) as ProductCardFeature[];

  // Price can vary when the customer picks between variants or add-ons, or the
  // product is made to order — mirror the detail page's "From" semantics.
  const variantPrices = product.variants.map((v) => v.price ?? product.price);
  const variableConfig =
    product.variants.length > 1 ||
    new Set(variantPrices).size > 1 ||
    product.optionGroups.some((g) => g.enabled && g.options.some((o) => o.enabled && o.priceAddon > 0));
  const fromPrice = product.productType === "CUSTOM" || variableConfig;

  // Compare-at only surfaces for a genuinely single-price product (never next to "From").
  const showCompareAt = !fromPrice && compareAt != null && compareAt > product.price;

  // Small section marker above the title: custom/clearance communicate themselves, NEW stays quiet.
  const kicker =
    product.productType === "CUSTOM"
      ? "Custom Order"
      : product.productType === "CLEARANCE"
        ? (product.condition && CONDITION_LABELS[product.condition]) || "Clearance"
        : null;

  // Hover swap is pure CSS (no re-render → no flicker). Arrows only move a
  // "manual" index that pins the image; leaving the card releases it.
  const nextImage = () => setManual((m) => ((m ?? 0) + 1) % count);
  const prevImage = () => setManual((m) => ((m ?? 0) - 1 + count) % count);

  return (
    <article className={`shop-card${buyable ? "" : " shop-card--unavailable"}`} onMouseLeave={() => setManual(null)}>
      <Link href={`/product/${product.slug}`} className="shop-card-media" aria-label={product.name}>
        {count > 0 ? (
          <>
            {images.map((img, i) => (
              <Image
                key={i}
                src={cldUrl(img.url, 800)}
                alt={img.alt ?? product.name}
                fill
                sizes="(min-width: 1200px) 25vw, (min-width: 850px) 33vw, (min-width: 600px) 50vw, 100vw"
                className="shop-card-img"
                style={manual !== null ? { opacity: i === manual ? 1 : 0 } : undefined}
              />
            ))}
            {count > 1 && (
              <div className="shop-card-swap">
                <button
                  className="shop-card-swap-btn"
                  aria-label="Previous image"
                  onClick={(e) => {
                    e.preventDefault();
                    prevImage();
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <button
                  className="shop-card-swap-btn"
                  aria-label="Next image"
                  onClick={(e) => {
                    e.preventDefault();
                    nextImage();
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </div>
            )}
          </>
        ) : (
          <span className="shop-card-fallback" aria-hidden="true">
            {product.name.charAt(0)}
          </span>
        )}
      </Link>
      <div className="shop-card-body">
        {kicker && <span className={`shop-card-kicker${product.productType === "CUSTOM" ? " acc" : ""}`}>{kicker}</span>}
        <h3 className="shop-card-title">
          <Link href={`/product/${product.slug}`}>{product.name}</Link>
        </h3>
        <div className="shop-card-foot">
          <div className="shop-card-pricing">
            <span className="shop-card-price">
              {fromPrice && <span className="shop-card-price-from">From&nbsp;</span>}
              {formatINR(product.price)}
              {showCompareAt && <span className="shop-card-price-was">{formatINR(compareAt!)}</span>}
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
