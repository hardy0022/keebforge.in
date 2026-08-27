"use client";

import type { ShopSort } from "@/lib/data";

const SORTS: { value: ShopSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name-asc", label: "Name: A–Z" },
  { value: "name-desc", label: "Name: Z–A" },
];

export function ShopSortBar({
  total,
  page,
  pages,
  sort,
}: {
  total: number;
  page: number;
  pages: number;
  sort?: ShopSort;
}) {
  return (
    <form method="get" className="shop-toolbar" aria-label="Product sorting">
      <p className="shop-count">
        {total} product{total === 1 ? "" : "s"}
        {pages > 1 ? ` · page ${page} of ${pages}` : ""}
      </p>
      <div className="shop-sort">
        <label className="shop-sort-label" htmlFor="shop-sort">
          Sort by
        </label>
        <select
          id="shop-sort"
          name="sort"
          defaultValue={sort ?? "newest"}
          className="shop-select"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}
