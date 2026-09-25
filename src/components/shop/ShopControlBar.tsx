"use client";

import { SHOP_SORTS, SHOP_SORT_LABELS, type ShopSort } from "@/lib/catalog/shop";

const SORTS = SHOP_SORTS.map((value) => ({
  value,
  label: SHOP_SORT_LABELS[value],
}));

export function ShopControlBar({
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
    <form method="get" className="shop-tools-form" aria-label="Product sorting">
      <div className="shop-toolbar">
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
      </div>
    </form>
  );
}