import Link from "next/link";
import { ProductCard } from "@/components/shop/ProductCard";
import type { ShopProduct } from "@/lib/data";

export function ShopGrid({
  items,
  page,
  pages,
  baseQuery,
  total,
  search,
}: {
  items: ShopProduct[];
  page: number;
  pages: number;
  baseQuery: string;
  total: number;
  search?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="card qcard p-10 text-center">
        <p className="ct mb-2">No products found</p>
        <p className="cd">
          {search ? `Nothing matched "${search}". ` : "No products in this category yet. "}
          Try a different search or filter.
        </p>
        <Link href="/shop" className="btn-ghost" style={{ width: "auto", paddingInline: 24, marginTop: 16 }}>
          Clear filters
        </Link>
      </div>
    );
  }

  const pageHref = (p: number) => `?${baseQuery ? `${baseQuery}&` : ""}page=${p}`;

  return (
    <>
      <p className="text-sm text-[var(--t3)] mb-4">
        {total} product{total === 1 ? "" : "s"}
        {pages > 1 ? ` · page ${page} of ${pages}` : ""}
      </p>
      <div className="shop-grid">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>

      {pages > 1 && (
        <nav className="shop-pager" aria-label="Pagination">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="btn-ghost" prefetch={false}>
              ← Prev
            </Link>
          )}
          <span className="text-sm text-[var(--t3)]">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link href={pageHref(page + 1)} className="btn-ghost" prefetch={false}>
              Next →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}