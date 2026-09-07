import { ProductCard } from "@/components/shop/ProductCard";
import { SectionHead } from "@/components/ui/SectionHead";
import { getRelatedProducts } from "@/lib/catalog/data";

/** "You May Also Like" grid, rendered as its own RSC so it can be
 *  Suspense-streamed after the main product UI. */
export async function RelatedProducts({
  productId,
  categoryId,
}: {
  productId: string;
  categoryId: string;
}) {
  const related = await getRelatedProducts(productId, categoryId);
  if (related.length === 0) return null;

  return (
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
  );
}
