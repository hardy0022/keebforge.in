import Link from "next/link";
import { ProductCard } from "@/components/shop/ProductCard";
import { ShopEmptyState, DEFAULT_EMPTY_STATE, type EmptyStateConfig } from "@/components/shop/ShopEmptyState";
import type { ShopProduct } from "@/lib/data";

/* 1 … around current … last, with ellipsis gaps; short ranges shown whole. */
function pageItems(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const nums = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((n) => n >= 1 && n <= pages)
    .sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}

export function ShopGrid({
  items,
  page,
  pages,
  baseQuery,
  empty,
}: {
  items: ShopProduct[];
  page: number;
  pages: number;
  baseQuery: string;
  empty?: EmptyStateConfig;
}) {
  if (items.length === 0) {
    return <ShopEmptyState config={empty ?? DEFAULT_EMPTY_STATE} />;
  }

  const pageHref = (p: number) => `?${baseQuery ? `${baseQuery}&` : ""}page=${p}`;

  return (
    <>
      <div className="shop-grid">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>

      {pages > 1 && (
        <nav className="shop-pager" aria-label="Pagination">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="shop-pager-num" prefetch={false}>
              ← Prev
            </Link>
          )}
          {pageItems(page, pages).map((it, i) =>
            it === "…" ? (
              <span key={`dots-${i}`} className="shop-pager-dots" aria-hidden="true">
                …
              </span>
            ) : it === page ? (
              <span key={it} className="shop-pager-num" aria-current="page">
                {it}
              </span>
            ) : (
              <Link key={it} href={pageHref(it)} className="shop-pager-num" prefetch={false}>
                {it}
              </Link>
            )
          )}
          {page < pages && (
            <Link href={pageHref(page + 1)} className="shop-pager-num" prefetch={false}>
              Next →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}