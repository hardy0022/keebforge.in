import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { AddToCart } from "@/components/shop/AddToCart";
import { ProductCard } from "@/components/shop/ProductCard";
import { SectionHead } from "@/components/ui/SectionHead";
import { ProductGallery } from "@/components/shop/ProductGallery";
import { buildMetadata, JsonLd, breadcrumbJsonLd, SITE_URL } from "@/lib/seo";
import { getProductBySlug, getRelatedProducts } from "@/lib/data";
import { availableQuantity } from "@/lib/cart";

type Props = { params: Promise<{ slug: string }> };

const labelize = (k: string) => k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function absUrl(u: string) {
  return u.startsWith("http") ? u : `${SITE_URL}${u}`;
}

function getJsonList(value: unknown): string[] {
  if (value && typeof value === "object" && "list" in value && Array.isArray((value as { list: unknown }).list)) {
    return (value as { list: string[] }).list.filter((v): v is string => typeof v === "string");
  }
  return [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};
  const image = product.images[0];
  return buildMetadata({
    title: product.seoTitle ?? `${product.name} | KeebForge Shop`,
    description: product.seoDescription ?? product.shortDescription ?? product.description ?? `${product.name} at KeebForge.`,
    path: `/product/${product.slug}`,
    image: image ? (image.url.startsWith("/") ? image.url : image.url) : undefined,
  });
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const available = availableQuantity(product.stock, product.reservedQuantity);
  const hasStock = available > 0 || product.variants.some((v) => availableQuantity(v.stock, v.reservedQuantity) > 0);
  const specs = product.specifications && typeof product.specifications === "object" ? (product.specifications as Record<string, unknown>) : null;

  const related = await getRelatedProducts(product.id, product.categoryId);
  const url = `${SITE_URL}/product/${product.slug}`;

  // Calculate price range for display
  const variantPrices = product.variants.map((v) => v.price ?? product.price);
  const minPrice = Math.min(product.price, ...variantPrices);
  const maxPrice = Math.max(product.price, ...variantPrices);
  const showPriceRange = minPrice !== maxPrice;

  return (
    <main>
      <div className="wrap pt-8">
        <Breadcrumbs
          items={[
            { name: "Shop", href: "/shop" },
            { name: product.category.name, href: `/shop/${product.category.slug}` },
            { name: product.name },
          ]}
        />
      </div>

      <section className="svc-section" aria-labelledby="product-heading">
        <div className="wrap">
          <div className="product-layout">
            {/* LEFT: Image Gallery */}
            <div className="product-gallery-column">
              <ProductGallery
                images={product.images}
                productName={product.name}
                variantImages={product.images} // Could be enhanced to filter by selected variant
              />
            </div>

            {/* RIGHT: Product Info */}
            <div className="product-info-column">
              <div className="product-meta">
                {product.brand && (
                  <Link href={`/shop?brand=${product.brand.slug}`} className="product-brand">
                    {product.brand.name}
                  </Link>
                )}
                <h1 id="product-heading" className="product-title">{product.name}</h1>
                {product.shortDescription && <p className="product-short-desc">{product.shortDescription}</p>}
              </div>

              <div className="product-price-section">
                <div className="product-price">
                  {showPriceRange ? (
                    <>
                      <span className="product-price-from">From</span>
                      <span className="product-price-amount">{minPrice === maxPrice ? minPrice : `${minPrice} – ${maxPrice}`}</span>
                    </>
                  ) : (
                    <>
                      {product.compareAtPrice && product.compareAtPrice > product.price && (
                        <span className="product-price-original">{minPrice > product.price ? "Was" : ""}</span>
                      )}
                      <span className="product-price-amount">{minPrice > product.price ? minPrice : product.price}</span>
                    </>
                  )}
                  {product.compareAtPrice && product.compareAtPrice > product.price && !showPriceRange && (
                    <span className="product-price-compare">{product.compareAtPrice}</span>
                  )}
                  {product.compareAtPrice && product.compareAtPrice > product.price && (
                    <span className="product-discount-badge">−{Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)}%</span>
                  )}
                </div>
                {hasStock && (
                  <p className="product-stock-status">
                    {available > 0 ? (
                      available <= 5 ? (
                        <span className="stock-low">Only {available} left in stock</span>
                      ) : (
                        <span className="stock-ok">In stock — ships within 1–2 business days</span>
                      )
                    ) : (
                      <span className="stock-out">Currently out of stock</span>
                    )}
                  </p>
                )}
              </div>

              <AddToCart
                productId={product.id}
                variants={product.variants.map((v) => ({
                  id: v.id,
                  name: v.name,
                  price: v.price,
                  compareAtPrice: v.compareAtPrice,
                  stock: v.stock,
                  reservedQuantity: v.reservedQuantity,
                }))}
                basePrice={product.price}
                baseCompareAt={product.compareAtPrice}
                baseAvailable={available}
              />

              <div className="product-meta-tags">
                {product.brand && (
                  <span className="meta-tag">{product.brand.name}</span>
                )}
                {product.sku && <span className="meta-tag">SKU: {product.sku}</span>}
                {product.type && <span className="meta-tag">{product.type.replace(/_/g, " ")}</span>}
              </div>

              {product.description && (
                <section className="product-section" aria-labelledby="description-heading">
                  <h2 id="description-heading" className="product-section-title">Description</h2>
                  <div className="product-description">
                    {product.description.split(/\n\n+/).map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                </section>
              )}

              {specs && Object.keys(specs).length > 0 && (
                <section className="product-section" aria-labelledby="specs-heading">
                  <h2 id="specs-heading" className="product-section-title">Specifications</h2>
                  <dl className="product-specs">
                    {Object.entries(specs).map(([k, v]) => (
                      <div key={k} className="product-spec-row">
                        <dt>{labelize(k)}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}

              {getJsonList(product.features).length > 0 && (
                <section className="product-section" aria-labelledby="features-heading">
                  <h2 id="features-heading" className="product-section-title">Key Features</h2>
                  <ul className="product-features">
                    {getJsonList(product.features).map((feature, i) => (
                      <li key={i}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {getJsonList(product.whatsIncluded).length > 0 && (
                <section className="product-section" aria-labelledby="included-heading">
                  <h2 id="included-heading" className="product-section-title">What&apos;s Included</h2>
                  <ul className="product-included">
                    {getJsonList(product.whatsIncluded).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}

              {product.shippingInfo && (
                <section className="product-section" aria-labelledby="shipping-heading">
                  <h2 id="shipping-heading" className="product-section-title">Shipping Information</h2>
                  <p className="product-shipping-info">{product.shippingInfo}</p>
                </section>
              )}

              {product.warrantyInfo && (
                <section className="product-section" aria-labelledby="warranty-heading">
                  <h2 id="warranty-heading" className="product-section-title">Warranty</h2>
                  <p className="product-warranty-info">{product.warrantyInfo}</p>
                </section>
              )}
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="svc-section" aria-labelledby="related-heading">
          <div className="wrap">
            <SectionHead title="You May Also Like" />
            <div className="shop-grid">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Shop", path: "/shop" },
            { name: product.category.name, path: `/shop/${product.category.slug}` },
            { name: product.name, path: `/product/${product.slug}` },
          ]),
          {
            "@type": "Product",
            name: product.name,
            description: product.seoDescription ?? product.shortDescription ?? product.description ?? undefined,
            image: product.images.length ? product.images.map((i) => absUrl(i.url)) : undefined,
            sku: product.sku ?? undefined,
            ...(product.brand ? { brand: { "@type": "Brand", name: product.brand.name } } : {}),
            offers: {
              "@type": "Offer",
              url,
              price: (minPrice / 100).toFixed(2),
              priceCurrency: "INR",
              availability: hasStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            },
          },
        ]}
      />
    </main>
  );
}