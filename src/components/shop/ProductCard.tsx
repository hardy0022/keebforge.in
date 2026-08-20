import Image from "next/image";
import Link from "next/link";
import type { ShopProduct } from "@/lib/data";
import { formatINR } from "@/lib/money";
import { availableQuantity } from "@/lib/cart";

export function ProductCard({ product }: { product: ShopProduct }) {
  const image = product.images[0];
  const compareAt = product.compareAtPrice;
  const avail = availableQuantity(product.stock, product.reservedQuantity);
  const inStock = avail > 0 || product.variants.length > 0;

  return (
    <Link href={`/product/${product.slug}`} className="shop-card">
      <div className="shop-card-media">
        {image ? (
          <Image
            src={image.url}
            alt={image.alt ?? product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover"
          />
        ) : (
          <span className="shop-card-fallback" aria-hidden="true">
            {product.name.charAt(0)}
          </span>
        )}
        {product.featured && <span className="qbadge" style={{ position: "absolute", top: 10, left: 10 }}>Featured</span>}
      </div>
      <div className="shop-card-body">
        {product.brand && <span className="shop-card-brand">{product.brand.name}</span>}
        <h3 className="shop-card-title">{product.name}</h3>
        {product.shortDescription && <p className="shop-card-desc">{product.shortDescription}</p>}
        <div className="flex items-baseline justify-between gap-2">
          <span className="shop-card-price">
            {formatINR(product.price)}
            {compareAt != null && compareAt > product.price && (
              <span className="line-through text-[var(--t3)] font-normal">{formatINR(compareAt)}</span>
            )}
          </span>
          <span className={`shop-card-stock${inStock ? "" : " out"}`}>{inStock ? "In stock" : "Out of stock"}</span>
        </div>
      </div>
    </Link>
  );
}