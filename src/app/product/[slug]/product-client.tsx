"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AddToCart } from "@/components/shop/AddToCart";
import { ProductConfigurator } from "@/components/shop/ProductConfigurator";
import { ProductGallery } from "@/components/shop/ProductGallery";
import { ColorSelector } from "@/components/shop/ColorSelector";
import type { ShopProduct } from "@/lib/catalog/data";
import { resolveProductAddon } from "@/lib/catalog/product-addon";

export function ProductClient({
  product,
  basePrice,
  baseAvailable,
  configurable,
  custom,
  optionGroups,
  brand,
  category,
  conditionLabel,
}: {
  product: ShopProduct & { colorOptions?: any[] };
  basePrice: number;
  baseAvailable: number;
  configurable: boolean;
  custom: boolean;
  optionGroups: any[];
  brand?: { name: string; slug: string } | null;
  category: { name: string; slug: string };
  conditionLabel?: string | null;
}) {
  const colors = (product.colorOptions ?? []).filter((c: any) => c.enabled);
  const baseColors = colors.filter((c: any) => (c.group ?? "BASE") === "BASE");
  const secondaryColors = colors.filter((c: any) => c.group === "SECONDARY");
  const secondaryHeading =
    (product as any).secondaryColorHeading?.trim() || "Color";
  const [colorId, setColorId] = useState<string | null>(
    baseColors[0]?.id ?? null,
  );
  const [secondaryColorId, setSecondaryColorId] = useState<string | null>(
    secondaryColors[0]?.id ?? null,
  );
  const selectedColor = useMemo(
    () => baseColors.find((c: any) => c.id === colorId) ?? baseColors[0] ?? null,
    [baseColors, colorId],
  );
  const selectedSecondaryColor = useMemo(
    () =>
      secondaryColors.find((c: any) => c.id === secondaryColorId) ??
      secondaryColors[0] ??
      null,
    [secondaryColors, secondaryColorId],
  );

  const colorAdjustment =
    (selectedColor?.priceAdjustment ?? 0) +
    (selectedSecondaryColor?.priceAdjustment ?? 0);
  const colorAdjustedBase = basePrice + colorAdjustment;
  const colorImage = selectedColor?.imageUrl
    ? { url: selectedColor.imageUrl, alt: selectedColor.name }
    : null;

  const resolvedAddon = resolveProductAddon(product as any, true);
  const addon = resolvedAddon.selected
    ? {
        enabled: true,
        title: resolvedAddon.title,
        description: resolvedAddon.description,
        price: resolvedAddon.price,
      }
    : null;

  return (
    <>
      <div className="product-gallery-column">
        <ProductGallery
          images={product.images}
          productName={product.name}
          colorImage={colorImage}
        />
      </div>

      <div className="product-info-column">
        <div className="product-meta">
          <p className="product-kicker-row">
            {brand && (
              <Link
                href={`/shop/${category.slug}?brand=${brand.slug}`}
                className="product-brand"
              >
                {brand.name}
              </Link>
            )}
            <Link href={`/shop/${category.slug}`} className="product-cat">
              {category.name}
            </Link>
            {custom && (
              <span className="product-type-chip acc">Custom Order</span>
            )}
            {conditionLabel && (
              <span className="product-type-chip">{conditionLabel}</span>
            )}
          </p>
          <h1 id="product-heading" className="product-title">
            {product.name}
          </h1>
        </div>
        {configurable ? (
          <ProductConfigurator
            productId={product.id}
            groups={optionGroups}
            basePrice={colorAdjustedBase}
            baseAvailable={baseAvailable}
            madeToOrder={custom}
            addon={addon}
            colorOptionId={selectedColor?.id ?? null}
            secondaryColorOptionId={selectedSecondaryColor?.id ?? null}
            colorSelector={
              <>
                {baseColors.length > 0 && (
                  <ColorSelector
                    colors={baseColors}
                    selectedId={selectedColor?.id ?? null}
                    onChange={setColorId}
                  />
                )}
                {secondaryColors.length > 0 && (
                  <ColorSelector
                    colors={secondaryColors}
                    selectedId={selectedSecondaryColor?.id ?? null}
                    onChange={setSecondaryColorId}
                    heading={secondaryHeading}
                  />
                )}
              </>
            }
          />
        ) : (
          <>
            {baseColors.length > 0 && (
              <ColorSelector
                colors={baseColors}
                selectedId={selectedColor?.id ?? null}
                onChange={setColorId}
              />
            )}
            {secondaryColors.length > 0 && (
              <ColorSelector
                colors={secondaryColors}
                selectedId={selectedSecondaryColor?.id ?? null}
                onChange={setSecondaryColorId}
                heading={secondaryHeading}
              />
            )}
            <AddToCart
              productId={product.id}
              variants={product.variants.map((v: any) => ({
                id: v.id,
                name: v.name,
                price: v.price,
                compareAtPrice: v.compareAtPrice,
                stock: v.stock,
                reservedQuantity: v.reservedQuantity,
                options: (v.options && typeof v.options === "object"
                  ? (v.options as Record<string, unknown>)
                  : null) as Record<string, string> | null,
              }))}
              baseAvailable={baseAvailable}
              madeToOrder={custom}
              addon={addon}
              colorOptionId={selectedColor?.id ?? null}
              secondaryColorOptionId={selectedSecondaryColor?.id ?? null}
            />
          </>
        )}
      </div>
    </>
  );
}
