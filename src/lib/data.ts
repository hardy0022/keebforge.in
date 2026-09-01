import "server-only";
import { cache } from "react";
import type { Prisma, ShopSectionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Mod groups with their active mods, for a device. */
export const getModsCatalog = cache((device?: "KEYBOARD" | "MOUSE") =>
  prisma.mods.findMany({
    where: { active: true, ...(device ? { device } : {}) },
    orderBy: { sortOrder: "asc" },
    include: {
      services: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  })
);

export type ModsGroups = Awaited<ReturnType<typeof getModsCatalog>>;

export const getApprovedReviews = cache((take = 12) =>
  prisma.review.findMany({
    where: { status: "APPROVED" },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
  })
);

export const getFeaturedWork = cache(() =>
  prisma.workProject.findMany({
    where: { active: true, featured: true },
    orderBy: { createdAt: "desc" },
    take: 6,
  })
);

export const getWorkProjectBySlug = cache((slug: string) =>
  prisma.workProject.findUnique({ where: { slug } })
);

export const getSiteSetting = cache((key: string) =>
  prisma.siteSetting.findUnique({ where: { key } }).then((s) => s?.value ?? null)
);

// ─── Shop catalog ───────────────────────────────────────────────────────────

export const getShopCategories = cache(() =>
  prisma.category.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } })
);

export const getCategoryBySlug = cache((slug: string) =>
  prisma.category.findFirst({ where: { slug, active: true } })
);

export const getShopBrands = cache(() =>
  prisma.brand.findMany({ where: { active: true }, orderBy: { name: "asc" } })
);

export type ShopSort = "newest" | "price-asc" | "price-desc" | "name-asc" | "name-desc";

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
      options: { where: { enabled: true }, select: { enabled: true, priceAddon: true } },
    },
  },
} satisfies Prisma.ProductSelect;

export type ShopProduct = Prisma.ProductGetPayload<{ select: typeof PRODUCT_LIST }>;

export const getShopProducts = cache((params: ShopParams) => {
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
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }] } : {}),
    ...(brandSlug ? { brand: { slug: brandSlug } } : {}),
    ...(minPrice != null || maxPrice != null ? { price: { gte: minPrice ?? undefined, lte: maxPrice ?? undefined } } : {}),
    // ponytail: availability uses stock > 0 on product OR any active variant;
    // reservations (stock - reserved) are enforced at add-to-cart/checkout.
    ...(inStock ? { OR: [{ stock: { gt: 0 } }, { variants: { some: { active: true, stock: { gt: 0 } } } }] } : {}),
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
    prisma.product.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select: PRODUCT_LIST }),
  ]).then(([total, items]) => ({
    items,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  }));
});

export const getProductBySlug = cache((slug: string) =>
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
          options: { where: { enabled: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        },
      },
      images: { where: { active: true }, orderBy: [{ primary: "desc" }, { sortOrder: "asc" }] },
    },
  })
);

export const getRelatedProducts = cache(async (productId: string, categoryId: string, take = 4) => {
  const sameCategory = await prisma.product.findMany({
    where: { active: true, id: { not: productId }, categoryId },
    orderBy: { createdAt: "desc" },
    take,
    select: PRODUCT_LIST,
  });
  if (sameCategory.length >= take) return sameCategory;
  // ponytail: top up thin categories with other active products so the grid never shows 1 lonely card
  const fill = await prisma.product.findMany({
    where: { active: true, id: { notIn: [productId, ...sameCategory.map((p) => p.id)] } },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    take: take - sameCategory.length,
    select: PRODUCT_LIST,
  });
  return [...sameCategory, ...fill];
});