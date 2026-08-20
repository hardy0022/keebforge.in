import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { ShopFilters } from "@/components/shop/ShopFilters";
import { ShopGrid } from "@/components/shop/ShopGrid";
import { buildMetadata } from "@/lib/seo";
import { getShopBrands, getShopCategories, getShopProducts, type ShopSort } from "@/lib/data";

export const metadata: Metadata = buildMetadata({
  title: "Shop — Keyboards, Switches, Keycaps & Accessories | KeebForge",
  description:
    "Shop mechanical keyboard parts at KeebForge — keyboards, switches, keycaps, stabilizers, PCBs, cases, cables and accessories.",
  path: "/shop",
});

type Props = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    brand?: string;
    min?: string;
    max?: string;
    inStock?: string;
    sort?: string;
    page?: string;
  }>;
};

const SORTS: ShopSort[] = ["featured", "newest", "price-asc", "price-desc", "name-asc"];
const toPaise = (v?: string) => {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n * 100 : undefined;
};

export default async function ShopPage({ searchParams }: Props) {
  const sp = await searchParams;
  const search = sp.q?.trim() || undefined;
  const category = sp.category?.trim() || undefined;
  const brandSlug = sp.brand?.trim() || undefined;
  const sort: ShopSort = SORTS.includes(sp.sort as ShopSort) ? (sp.sort as ShopSort) : "featured";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const inStock = sp.inStock === "on" || sp.inStock === "true" || sp.inStock === "1";
  const minPrice = toPaise(sp.min);
  const maxPrice = toPaise(sp.max);

  const [categories, brands, result] = await Promise.all([
    getShopCategories(),
    getShopBrands(),
    getShopProducts({
      categorySlug: category,
      search,
      brandSlug,
      minPrice,
      maxPrice,
      inStock: inStock || undefined,
      sort,
      page,
    }),
  ]);

  const baseParams = new URLSearchParams();
  if (search) baseParams.set("q", search);
  if (category) baseParams.set("category", category);
  if (brandSlug) baseParams.set("brand", brandSlug);
  if (sp.min) baseParams.set("min", sp.min);
  if (sp.max) baseParams.set("max", sp.max);
  if (inStock) baseParams.set("inStock", "on");
  if (sort !== "featured") baseParams.set("sort", sort);

  return (
    <main>
      <PageHero
        tag="Shop"
        title="Keyboard Parts & Accessories"
        desc="Browse the KeebForge catalog — keyboards, switches, keycaps, stabilizers, PCBs, cases, cables and accessories. Inventory is updated live from the database."
        pills={["In-stock items only", "Prices in INR", "Ships across India"]}
      />
      <section className="svc-section">
        <div className="wrap">
          <ShopFilters
            categories={categories}
            brands={brands}
            category={category}
            brandSlug={brandSlug}
            search={search}
            min={sp.min}
            max={sp.max}
            inStock={inStock}
            sort={sort}
          />
          <ShopGrid
            items={result.items}
            page={page}
            pages={result.pages}
            total={result.total}
            baseQuery={baseParams.toString()}
            search={search}
          />
        </div>
      </section>
    </main>
  );
}