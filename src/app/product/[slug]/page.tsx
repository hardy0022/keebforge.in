import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { AddToCart } from "@/components/shop/AddToCart";
import { ProductConfigurator } from "@/components/shop/ProductConfigurator";
import { ShippingWarranty } from "@/components/shop/ShippingWarranty";
import { ProductCard } from "@/components/shop/ProductCard";
import { SectionHead } from "@/components/ui/SectionHead";
import { WhyForge } from "@/components/home/WhyForge";
import { ProductGallery } from "@/components/shop/ProductGallery";
import { buildMetadata, JsonLd, breadcrumbJsonLd, SITE_URL } from "@/lib/seo";
import { getProductBySlug, getRelatedProducts } from "@/lib/data";
import { availableQuantity } from "@/lib/cart";
import { formatINR, formatINRRange } from "@/lib/money";
import { isPurchasable, CONDITION_LABELS } from "@/lib/shop";

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
    description: product.seoDescription ?? product.description ?? `${product.name} at KeebForge.`,
    path: `/product/${product.slug}`,
    image: image?.url,
  });
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const custom = product.productType === "CUSTOM";
  const optionGroups = product.optionGroups;
  const configurable = optionGroups.length > 0;
  const available = custom ? 99 : availableQuantity(product.stock, product.reservedQuantity);
  const buyable = isPurchasable(product);
  const specs =
    product.specifications && typeof product.specifications === "object"
      ? Object.entries(product.specifications as Record<string, unknown>).filter(
          ([, v]) => v != null && String(v).trim() !== ""
        )
      : [];
  const features = getJsonList(product.features);
  const included = getJsonList(product.whatsIncluded);

  const related = await getRelatedProducts(product.id, product.categoryId);
  const url = `${SITE_URL}/product/${product.slug}`;

  const variantPrices = product.variants.map((v) => v.price ?? product.price);
  const minPrice = Math.min(product.price, ...variantPrices);
  const maxPrice = Math.max(product.price, ...variantPrices);
  const fromPrice = custom || product.variants.length > 0 || configurable;
  const showRange = !fromPrice && minPrice !== maxPrice;
  const compareAt = !showRange && !fromPrice && product.compareAtPrice && product.compareAtPrice > product.price ? product.compareAtPrice : null;
  const savePct = compareAt ? Math.round((1 - product.price / compareAt) * 100) : null;

  const conditionLabel =
    product.productType === "CLEARANCE"
      ? (product.condition && CONDITION_LABELS[product.condition]) || "Clearance"
      : null;

  return (
    <main className="product-page">
      <div className="wrap page-start">
        <Breadcrumbs
          items={[
            { name: "Shop", href: "/shop" },
            { name: product.category.name, href: `/shop/${product.category.slug}` },
            { name: product.name },
          ]}
        />
      </div>

      {/* ─── MAIN PRODUCT ────────────────────────────────────────────────── */}
      <section className="svc-section" aria-labelledby="product-heading">
        <div className="wrap">
          <div className="product-layout">
            <div className="product-gallery-column">
              <ProductGallery images={product.images} productName={product.name} />
            </div>

            <div className="product-info-column">
              <div className="product-meta">
                <p className="product-kicker-row">
                  {product.brand && (
                    <Link href={`/shop?brand=${product.brand.slug}`} className="product-brand">
                      {product.brand.name}
                    </Link>
                  )}
                  <Link href={`/shop/${product.category.slug}`} className="product-cat">
                    {product.category.name}
                  </Link>
                  {custom && <span className="product-type-chip acc">Custom Order</span>}
                  {conditionLabel && <span className="product-type-chip">{conditionLabel}</span>}
                </p>
                <h1 id="product-heading" className="product-title">{product.name}</h1>
              </div>

              <div className="product-price-section">
                <div className="product-price">
                  <span className="product-price-amount">
                    {showRange ? formatINRRange(minPrice, maxPrice) : formatINR(minPrice)}
                  </span>
                  {compareAt && <span className="product-price-compare">{formatINR(compareAt)}</span>}
                  {savePct != null && <span className="product-discount-badge">Save {savePct}%</span>}
                </div>
              </div>

              {configurable ? (
                <ProductConfigurator
                  productId={product.id}
                  groups={optionGroups}
                  baseAvailable={available}
                />
              ) : (
                <AddToCart
                  productId={product.id}
                  variants={product.variants.map((v) => ({
                    id: v.id,
                    name: v.name,
                    price: v.price,
                    compareAtPrice: v.compareAtPrice,
                    stock: v.stock,
                    reservedQuantity: v.reservedQuantity,
                    options: (v.options && typeof v.options === "object" ? (v.options as Record<string, unknown>) : null) as
                      | Record<string, string>
                      | null,
                  }))}
                  baseAvailable={available}
                />
              )}

              {(product.sku || product.type) && (
                <div className="product-meta-tags">
                  {product.sku && <span className="meta-tag">SKU: {product.sku}</span>}
                  {product.type && <span className="meta-tag">{labelize(product.type)}</span>}
                </div>
              )}

              {!custom && (
                <p className="product-custom-note">
                  Want this modified or part of a full build?{" "}
                  <Link href="/contact">Start a custom build →</Link>
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ─── SPECS | DESCRIPTION / FEATURES / INCLUDED ───────────────────── */}
      {(product.description || specs.length > 0 || features.length > 0 || included.length > 0) && (
        <section className="svc-section" aria-label="Product details">
          <div className="wrap">
            <div className="product-details-grid">
              {specs.length > 0 && (
                <section className="product-section" aria-labelledby="specs-heading">
                  <h2 id="specs-heading" className="product-section-title">Specifications</h2>
                  <dl className="product-specs">
                    {specs.map(([k, v]) => (
                      <div key={k} className="product-spec-row">
                        <dt>{labelize(k)}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
              <div className="product-lists">
                {product.description && (
                  <section className="product-section" aria-labelledby="description-heading">
                    <h2 id="description-heading" className="product-section-title">About this product</h2>
                    <div className="product-description">
                      {product.description.split(/\n\n+/).map((para, i) => (
                        <p key={i}>{para}</p>
                      ))}
                    </div>
                  </section>
                )}
                {features.length > 0 && (
                  <section className="product-section" aria-labelledby="features-heading">
                    <h2 id="features-heading" className="product-section-title">Key Features</h2>
                    <ul className="product-features">
                      {features.map((feature, i) => (
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
                {included.length > 0 && (
                  <section className="product-section" aria-labelledby="included-heading">
                    <h2 id="included-heading" className="product-section-title">What&apos;s Included</h2>
                    <ul className="product-included">
                      {included.map((item, i) => (
                        <li key={i}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
                          </svg>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─── SHIPPING / WARRANTY ─────────────────────────────────────────── */}
      <ShippingWarranty
        shippingInfo={product.shippingInfo}
        warrantyInfo={product.warrantyInfo}
      />

      {/* ─── RELATED ─────────────────────────────────────────────────────── */}
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

      <WhyForge num="// Why Forge" />

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
            description: product.seoDescription ?? product.description ?? undefined,
            image: product.images.length ? product.images.map((i) => absUrl(i.url)) : undefined,
            sku: product.sku ?? undefined,
            ...(product.brand ? { brand: { "@type": "Brand", name: product.brand.name } } : {}),
            offers: {
              "@type": "Offer",
              url,
              price: minPrice / 100,
              priceCurrency: "INR",
              availability: buyable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            },
          },
        ]}
      />
    </main>
  );
}
