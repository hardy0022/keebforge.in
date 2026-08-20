import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { AddToCart } from "@/components/shop/AddToCart";
import { ProductCard } from "@/components/shop/ProductCard";
import { SectionHead } from "@/components/ui/SectionHead";
import { buildMetadata, JsonLd, breadcrumbJsonLd, SITE_URL } from "@/lib/seo";
import { getProductBySlug, getRelatedProducts } from "@/lib/data";
import { availableQuantity } from "@/lib/cart";

type Props = { params: Promise<{ slug: string }> };

const labelize = (k: string) => k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function absUrl(u: string) {
  return u.startsWith("http") ? u : `${SITE_URL}${u}`;
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
  const offerPrice = Math.min(
    product.price,
    ...product.variants.map((v) => v.price ?? product.price)
  );

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

      <section className="svc-section">
        <div className="wrap">
          <div className="grid gap-8 lg:grid-cols-2 items-start">
            <div className="shop-gallery">
              {product.images.length > 0 ? (
                product.images.map((img) => (
                  <div key={img.id} className="shop-gallery-item">
                    <Image
                      src={img.url}
                      alt={img.alt ?? product.name}
                      fill
                      sizes="(min-width: 1024px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                ))
              ) : (
                <div className="shop-gallery-item shop-card-fallback" aria-hidden="true">
                  {product.name.charAt(0)}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-5">
              {product.brand && (
                <Link href={`/shop?brand=${product.brand.slug}`} className="text-sm text-[var(--acc)] hover:underline">
                  {product.brand.name}
                </Link>
              )}
              <h1 className="font-display text-3xl font-bold text-[var(--t1)] md:text-4xl">{product.name}</h1>
              {product.shortDescription && <p className="cd">{product.shortDescription}</p>}

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

              {hasStock && (
                <div className="flex flex-wrap gap-2">
                  {product.brand && (
                    <span className="qbadge">
                      {product.brand.name}
                    </span>
                  )}
                  {product.sku && <span className="qbadge">SKU {product.sku}</span>}
                </div>
              )}

              {product.description && (
                <div className="prose-kf">
                  {product.description.split(/\n\n+/).map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>
              )}

              {specs && (
                <div>
                  <h2 className="ct mb-3">Specifications</h2>
                  <dl className="spec-grid">
                    {Object.entries(specs).map(([k, v]) => (
                      <div key={k} className="spec-row">
                        <dt>{labelize(k)}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="svc-section" aria-labelledby="related">
          <div className="wrap">
            <SectionHead title="Related Products" />
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
              price: (offerPrice / 100).toFixed(2),
              priceCurrency: "INR",
              availability: hasStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            },
          },
        ]}
      />
    </main>
  );
}