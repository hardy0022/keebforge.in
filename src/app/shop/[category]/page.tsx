import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { WhyForge } from "@/components/home/WhyForge";
import { ShopSortBar } from "@/components/shop/ShopSortBar";
import { ShopGrid } from "@/components/shop/ShopGrid";
import { buildMetadata } from "@/lib/seo";
import { getCategoryBySlug, getShopProducts, type ShopSort } from "@/lib/data";

const SORTS: ShopSort[] = ["newest", "price-asc", "price-desc", "name-asc", "name-desc"];
const toPaise = (v?: string) => {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n * 100 : undefined;
};

type Props = {
  params: Promise<{ category: string }>;
  searchParams: Promise<{
    q?: string;
    brand?: string;
    min?: string;
    max?: string;
    inStock?: string;
    sort?: string;
    page?: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const cat = await getCategoryBySlug(category);
  if (!cat) return {};
  return buildMetadata({
    title: `${cat.name} — Shop | KeebForge`,
    description: cat.description ?? `Shop ${cat.name.toLowerCase()} at KeebForge.`,
    path: `/shop/${cat.slug}`,
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category: slug } = await params;
  const cat = await getCategoryBySlug(slug);
  if (!cat) notFound();

  const sp = await searchParams;
  const search = sp.q?.trim() || undefined;
  const brandSlug = sp.brand?.trim() || undefined;
  const sort: ShopSort = SORTS.includes(sp.sort as ShopSort) ? (sp.sort as ShopSort) : "newest";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const inStock = sp.inStock === "on" || sp.inStock === "true" || sp.inStock === "1";
  const minPrice = toPaise(sp.min);
  const maxPrice = toPaise(sp.max);

  const result = await getShopProducts({
    categorySlug: cat.slug,
    search,
    brandSlug,
    minPrice,
    maxPrice,
    inStock: inStock || undefined,
    sort,
    page,
  });

  const baseParams = new URLSearchParams();
  if (search) baseParams.set("q", search);
  if (brandSlug) baseParams.set("brand", brandSlug);
  if (sp.min) baseParams.set("min", sp.min);
  if (sp.max) baseParams.set("max", sp.max);
  if (inStock) baseParams.set("inStock", "on");
  if (sort !== "newest") baseParams.set("sort", sort);

  return (
    <main className="shop-page">
      <PageHero
        tag="Shop"
        title={cat.name}
        desc={cat.description ?? `Browse ${cat.name.toLowerCase()} at KeebForge.`}
        pills={["Category"]}
      />
      <section className="svc-section">
        <div className="wrap">
          <ShopSortBar total={result.total} page={page} pages={result.pages} sort={sort} />
          <ShopGrid
            items={result.items}
            page={page}
            pages={result.pages}
            baseQuery={baseParams.toString()}
          />
        </div>
      </section>
      <WhyForge num="// Why Forge" />
    </main>
  );
}