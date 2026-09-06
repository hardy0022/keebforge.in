import "server-only";
import { cache } from "react";
import type { Prisma, ShopSectionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TAG, TTL, defineCached } from "@/lib/caching/cache";

/** Mod groups with their active mods, for a device. Admin-only edits. */
export const getModsCatalog = defineCached(
  (device?: "KEYBOARD" | "MOUSE") =>
    prisma.mods.findMany({
      where: { active: true, ...(device ? { device } : {}) },
      orderBy: { sortOrder: "asc" },
      include: {
        services: {
          where: { active: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
  { tags: [TAG.services], revalidate: TTL.stable, keys: ["mods-catalog"] },
);

export const getWorkProjectBySlug = defineCached(
  (slug: string) => prisma.workProject.findUnique({ where: { slug } }),
  { tags: [TAG.work], revalidate: TTL.stable, keys: ["work-project-by-slug"] },
);

/** All active portfolio projects for /work. Admin-only edits. */
export const getWorkProjects = defineCached(
  () =>
    prisma.workProject.findMany({
      where: { active: true },
      orderBy: [
        { sortOrder: "asc" },
        { featured: "desc" },
        { createdAt: "desc" },
      ],
    }),
  { tags: [TAG.work], revalidate: TTL.stable, keys: ["work-projects"] },
);

/** Single siteSetting read, cached short and invalidated on admin save.
 *  Env-specific keys (maintenanceMode.production vs .development) stay
 *  separate — one key, one cache entry, never merged. */
export const getSiteSetting = defineCached(
  (key: string) =>
    prisma.siteSetting
      .findUnique({ where: { key } })
      .then((s) => s?.value ?? null),
  {
    tags: [TAG.siteSettings],
    revalidate: TTL.settings,
    keys: ["site-setting"],
  },
);

// ─── Shop catalog ───────────────────────────────────────────────────────────

export const getCategoryBySlug = defineCached(
  (slug: string) =>
    prisma.category.findFirst({ where: { slug, active: true } }),
  {
    tags: [TAG.categories],
    revalidate: TTL.catalog,
    keys: ["category-by-slug"],
  },
);

export type ShopSort =
  "newest" | "price-asc" | "price-desc" | "name-asc" | "name-desc";

export type ShopParams = {
  categorySlug?: string;
  productType?: ShopSectionType;
  search?: string;
  brandSlug?: string;
  minPrice?: number; // paise
  maxPrice?: number; // paise
  inStock?: boolean;
  sort?: ShopSort;
  page?: number; // 1-based
  pageSize?: number;
};

const PRODUCT_LIST = {
  id: true,
  name: true,
  slug: true,
  price: true,
  compareAtPrice: true,
  stock: true,
  reservedQuantity: true,
  active: true,
  status: true,
  productType: true,
  condition: true,
  specifications: true,
  cardFeatures: true,
  featured: true,
  createdAt: true,
  category: { select: { slug: true, name: true } },
  brand: { select: { slug: true, name: true } },
  images: {
    where: { active: true },
    orderBy: [{ primary: "desc" }, { sortOrder: "asc" }],
    select: { url: true, alt: true },
  },
  variants: {
    where: { active: true },
    select: { price: true, active: true, stock: true, reservedQuantity: true },
    orderBy: { price: "asc" },
  },
  optionGroups: {
    where: { enabled: true },
    select: {
      enabled: true,
      options: {
        where: { enabled: true },
        select: { enabled: true, priceAddon: true },
      },
    },
  },
} satisfies Prisma.ProductSelect;

export type ShopProduct = Prisma.ProductGetPayload<{
  select: typeof PRODUCT_LIST;
}>;

/** Deduped raw query (React.cache only) — used for search, whose unbounded
 *  query strings must not grow the persistent cache. */
const shopProducts = cache(async (params: ShopParams) => {
  const {
    categorySlug,
    productType,
    search,
    brandSlug,
    minPrice,
    maxPrice,
    inStock,
    sort = "newest",
    page = 1,
    pageSize = 24,
  } = params;

  // ponytail: no product.active filter — shop shows all products incl. out-of-stock;
  // re-add if drafts/unlisted products ever need hiding from the storefront
  const where: Prisma.ProductWhereInput = {
    category: { active: true, ...(categorySlug ? { slug: categorySlug } : {}) },
    ...(productType ? { productType } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(brandSlug ? { brand: { slug: brandSlug } } : {}),
    ...(minPrice != null || maxPrice != null
      ? { price: { gte: minPrice ?? undefined, lte: maxPrice ?? undefined } }
      : {}),
    // ponytail: availability uses stock > 0 on product OR any active variant;
    // reservations (stock - reserved) are enforced at add-to-cart/checkout.
    ...(inStock
      ? {
          OR: [
            { stock: { gt: 0 } },
            { variants: { some: { active: true, stock: { gt: 0 } } } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    sort === "price-asc"
      ? [{ price: "asc" }]
      : sort === "price-desc"
        ? [{ price: "desc" }]
        : sort === "name-asc"
          ? [{ name: "asc" }]
          : sort === "name-desc"
            ? [{ name: "desc" }]
            : [{ createdAt: "desc" }];

  return Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: PRODUCT_LIST,
    }),
  ]).then(([total, items]) => ({
    items,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  }));
});

/** Cross-request cached listing (all filter variants except search). */
const cachedShopProducts = defineCached(
  (params: ShopParams) => shopProducts(params),
  {
    keys: ["shop-products"],
    tags: [TAG.products, TAG.categories],
    revalidate: TTL.catalog,
  },
);

/** Search hits the raw query (unbounded user strings must not fill the data
 *  cache); every other listing shape is cached and invalidated by product /
 *  category admin mutations. */
export function getShopProducts(params: ShopParams) {
  const key = {
    categorySlug: params.categorySlug,
    productType: params.productType,
    brandSlug: params.brandSlug,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    inStock: params.inStock,
    sort: params.sort ?? "newest",
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 24,
  };
  const q = params.search?.trim();
  return q ? shopProducts({ ...key, search: q }) : cachedShopProducts(key);
}

export const getProductBySlug = defineCached(
  (slug: string) =>
    prisma.product.findFirst({
      where: { slug, active: true },
      include: {
        category: true,
        brand: { where: { active: true } },
        variants: { where: { active: true }, orderBy: { price: "asc" } },
        optionGroups: {
          where: { enabled: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: {
            options: {
              where: { enabled: true },
              orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            },
          },
        },
        images: {
          where: { active: true },
          orderBy: [{ primary: "desc" }, { sortOrder: "asc" }],
        },
      },
    }),
  // unstable_cache tags are static per wrapper, so per-slug tags aren't
  // available here (Next 16 without cache components); a single product edit
  // invalidates the whole products slice instead.
  {
    tags: [TAG.products, TAG.categories],
    revalidate: TTL.catalog,
    keys: ["product-by-slug"],
  },
);

export const getRelatedProducts = defineCached(
  async (productId: string, categoryId: string, take: number = 4) => {
    const sameCategory = await prisma.product.findMany({
      where: { active: true, id: { not: productId }, categoryId },
      orderBy: { createdAt: "desc" },
      take,
      select: PRODUCT_LIST,
    });
    if (sameCategory.length >= take) return sameCategory;
    // ponytail: top up thin categories with other active products so the grid never shows 1 lonely card
    const fill = await prisma.product.findMany({
      where: {
        active: true,
        id: { notIn: [productId, ...sameCategory.map((p) => p.id)] },
      },
      orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
      take: take - sameCategory.length,
      select: PRODUCT_LIST,
    });
    return [...sameCategory, ...fill];
  },
  {
    tags: [TAG.products, TAG.categories],
    revalidate: TTL.catalog,
    keys: ["related-products"],
  },
);
