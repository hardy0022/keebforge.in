import { ShopSortBar } from "@/components/shop/ShopSortBar";
import { ShopGrid } from "@/components/shop/ShopGrid";
import type { EmptyStateConfig } from "@/components/shop/ShopEmptyState";
import { getShopProducts, type ShopSort } from "@/lib/data";

const SORTS: ShopSort[] = ["newest", "price-asc", "price-desc", "name-asc", "name-desc"];

/* Bespoke empty states per listing — sections without one fall back to the generic state. */
const EMPTY_STATES: Partial<Record<"custom" | "new" | "clearance", EmptyStateConfig>> = {
  custom: {
    eyebrow: "// Made to Order",
    title: "Custom Builds, Made to Order",
    desc: "Tell us what you're looking for and we'll help you put together the right keyboard, switches, keycaps and modifications.",
    actions: [
      { label: "Start a Custom Build →", href: "/contact", variant: "primary" },
      { label: "Explore Mods →", href: "/mods", variant: "ghost" },
    ],
  },
};

export const SHOP_SECTIONS = { custom: "CUSTOM", new: "NEW", clearance: "CLEARANCE" } as const;
export type ShopSectionKey = keyof typeof SHOP_SECTIONS;

/** Shared shop listing (sort bar + grid) used by /shop and each section route. */
export async function ShopCatalog({
  section,
  searchParams,
}: {
  section?: ShopSectionKey;
  searchParams: { sort?: string; page?: string };
}) {
  const sort: ShopSort = SORTS.includes(searchParams.sort as ShopSort)
    ? (searchParams.sort as ShopSort)
    : "newest";
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const result = await getShopProducts({
    ...(section ? { productType: SHOP_SECTIONS[section] } : {}),
    sort,
    page,
  });

  return (
    <>
      <ShopSortBar total={result.total} page={page} pages={result.pages} sort={sort} />
      <ShopGrid
        items={result.items}
        page={page}
        pages={result.pages}
        baseQuery={`sort=${sort}`}
        empty={section ? EMPTY_STATES[section] : undefined}
      />
    </>
  );
}
