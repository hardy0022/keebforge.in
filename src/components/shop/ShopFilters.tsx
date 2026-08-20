import type { Brand, Category } from "@prisma/client";
import type { ShopSort } from "@/lib/data";

const SORTS: { value: ShopSort; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name-asc", label: "Name: A–Z" },
];

export function ShopFilters({
  categories,
  brands,
  category,
  brandSlug,
  search,
  min,
  max,
  inStock,
  sort,
}: {
  categories: Category[];
  brands: Brand[];
  category?: string;
  brandSlug?: string;
  search?: string;
  min?: string;
  max?: string;
  inStock?: boolean;
  sort?: ShopSort;
}) {
  return (
    <form method="get" className="shop-filters" aria-label="Product filters">
      <input type="search" name="q" defaultValue={search} placeholder="Search products…" className="shop-field" />
      {!category && (
        <select name="category" defaultValue={category ?? ""} className="shop-field">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <select name="brand" defaultValue={brandSlug ?? ""} className="shop-field">
        <option value="">All brands</option>
        {brands.map((b) => (
          <option key={b.slug} value={b.slug}>
            {b.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <input type="number" name="min" min={0} defaultValue={min} placeholder="Min ₹" className="shop-field" />
        <input type="number" name="max" min={0} defaultValue={max} placeholder="Max ₹" className="shop-field" />
      </div>
      <label className="shop-check">
        <input type="checkbox" name="inStock" defaultChecked={inStock} />
        <span>In stock only</span>
      </label>
      <select name="sort" defaultValue={sort ?? "featured"} className="shop-field">
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <button type="submit" className="btn-ghost">
        Apply filters
      </button>
    </form>
  );
}