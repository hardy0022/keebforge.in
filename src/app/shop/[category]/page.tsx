import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { WhyForge } from "@/components/home/WhyForge";
import { ShopControlBar } from "@/components/shop/ShopControlBar";
import { ShopGrid } from "@/components/shop/ShopGrid";
import {
  buildMetadata,
  JsonLd,
  breadcrumbJsonLd,
} from "@/lib/seo";
import { SHOP_SORTS } from "@/lib/catalog/shop";
import {
  getCategoryBySlug,
  getShopProducts,
  type ShopSort,
} from "@/lib/catalog/data";

type Props = {
  params: Promise<{ category: string }>;
  searchParams: Promise<{
    sort?: string;
    page?: string;
  }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const cat = await getCategoryBySlug(category);
  // notFound() here (pre-render) so miss-status is 404 even though the route
  // has a loading.tsx that would otherwise commit a 200 shell first (G-003).
  if (!cat) notFound();
  return buildMetadata({
    title: `${cat.name} — Shop | KeebForge`,
    description: `Shop ${cat.name.toLowerCase()} — keyboards, switches, keycaps and mods at KeebForge with India-wide shipping.`,
    path: `/shop/${cat.slug}`,
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category: slug } = await params;
  const cat = await getCategoryBySlug(slug);
  if (!cat) notFound();

  const sp = await searchParams;
  const sort: ShopSort = SHOP_SORTS.includes(sp.sort as ShopSort)
    ? (sp.sort as ShopSort)
    : "newest";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const result = await getShopProducts({
    categorySlug: cat.slug,
    sort,
    page,
  });

  const baseParams = new URLSearchParams();
  if (sort !== "newest") baseParams.set("sort", sort);

  return (
    <main className="shop-page">
      <PageHero
        tag="Shop"
        title={cat.name}
        desc={`Browse ${cat.name.toLowerCase()} at KeebForge.`}
        pills={["Category"]}
      />
      <section className="svc-section">
        <div className="wrap">
          <ShopControlBar
            total={result.total}
            page={page}
            pages={result.pages}
            sort={sort}
          />
          <ShopGrid
            items={result.items}
            page={page}
            pages={result.pages}
            baseQuery={baseParams.toString()}
          />
        </div>
      </section>
      <WhyForge num="// Why Forge" />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Shop", path: "/shop" },
          { name: cat.name, path: `/shop/${cat.slug}` },
        ])}
      />
    </main>
  );
}
