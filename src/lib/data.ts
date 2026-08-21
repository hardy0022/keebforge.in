import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Service groups with their active services, for a device. */
export const getServiceCatalog = cache((device?: "KEYBOARD" | "MOUSE") =>
  prisma.serviceGroup.findMany({
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

export const getServiceBySlug = cache((device: "KEYBOARD" | "MOUSE", slug: string) =>
  prisma.service.findFirst({
    where: { slug, device, active: true },
    include: { group: true },
  })
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

export type ShopSort = "featured" | "newest" | "price-asc" | "price-desc" | "name-asc";

export type ShopParams = {
  categorySlug?: string;
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
  shortDescription: true,
  price: true,
  compareAtPrice: true,
  stock: true,
  reservedQuantity: true,
  featured: true,
  createdAt: true,
  category: { select: { slug: true, name: true } },
  brand: { select: { slug: true, name: true } },
  images: {
    where: { active: true },
    orderBy: [{ primary: "desc" }, { sortOrder: "asc" }],
    take: 1,
    select: { url: true, alt: true },
  },
  variants: { where: { active: true }, select: { price: true }, orderBy: { price: "asc" } },
} satisfies Prisma.ProductSelect;

export type ShopProduct = Prisma.ProductGetPayload<{ select: typeof PRODUCT_LIST }>;

export const getShopProducts = cache((params: ShopParams) => {
  const {
    categorySlug,
    search,
    brandSlug,
    minPrice,
    maxPrice,
    inStock,
    sort = "featured",
    page = 1,
    pageSize = 12,
  } = params;

  const where: Prisma.ProductWhereInput = {
    active: true,
    category: { active: true, ...(categorySlug ? { slug: categorySlug } : {}) },
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { shortDescription: { contains: search, mode: "insensitive" } }] } : {}),
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
          : sort === "newest"
            ? [{ createdAt: "desc" }]
            : [{ featured: "desc" }, { createdAt: "desc" }];

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
      images: { where: { active: true }, orderBy: [{ primary: "desc" }, { sortOrder: "asc" }] },
    },
  })
);

export const getRelatedProducts = cache((productId: string, categoryId: string, take = 4) =>
  prisma.product.findMany({
    where: { active: true, id: { not: productId }, categoryId },
    orderBy: { createdAt: "desc" },
    take,
    select: PRODUCT_LIST,
  })
);