import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ProductStatus, ProductType } from "@/lib/product-labels";
export type { ProductStatus, ProductType };
export { PRODUCT_STATUS_LABELS, PRODUCT_TYPE_LABELS } from "@/lib/product-labels";

/** Effective selling price for a product/variant (variant price wins when set). */
export function sellingPrice(p: { price: number; compareAtPrice: number | null }, v?: { price: number | null; compareAtPrice: number | null } | null) {
  return { price: v?.price ?? p.price, compareAtPrice: v?.compareAtPrice ?? p.compareAtPrice };
}

export function availableStock(stock: number, reserved: number) {
  return Math.max(0, stock - reserved);
}

// ─── Categories & brands ─────────────────────────────────────────────────────

export const getAdminCategories = cache(() =>
  prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } })
);

export const getAdminBrands = cache(() => prisma.brand.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } }));

// ─── Product list ────────────────────────────────────────────────────────────

export type AdminProductQuery = {
  q?: string;
  category?: string;
  brand?: string;
  stock?: "in" | "low" | "out";
  status?: ProductStatus | "any";
  sort?: "newest" | "oldest" | "price-asc" | "price-desc" | "name-asc";
  page?: number;
  pageSize?: number;
};

export const getAdminProducts = cache((params: AdminProductQuery) => {
  const { q, category, brand, stock, status = "any", sort = "newest", page = 1, pageSize = 20 } = params;

  const where: Prisma.ProductWhereInput = {
    ...(status === "any" ? {} : { status }),
    ...(category ? { category: { slug: category } } : {}),
    ...(brand ? { brand: { slug: brand } } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] } : {}),
    ...(stock === "in" ? { OR: [{ stock: { gt: 0 } }, { variants: { some: { active: true, stock: { gt: 0 } } } }] } : {}),
    ...(stock === "low" ? { stock: { lte: prisma.product.fields.lowStockThreshold } } : {}),
    ...(stock === "out" ? { AND: [{ stock: { lte: 0 } }, { variants: { none: { active: true, stock: { gt: 0 } } } }] } : {}),
  };

  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    sort === "oldest"
      ? [{ createdAt: "asc" }]
      : sort === "price-asc"
        ? [{ price: "asc" }]
        : sort === "price-desc"
          ? [{ price: "desc" }]
          : sort === "name-asc"
            ? [{ name: "asc" }]
            : [{ createdAt: "desc" }];

  const select = {
    id: true,
    name: true,
    slug: true,
    sku: true,
    type: true,
    status: true,
    price: true,
    compareAtPrice: true,
    costPrice: true,
    stock: true,
    reservedQuantity: true,
    lowStockThreshold: true,
    featured: true,
    createdAt: true,
    updatedAt: true,
    category: { select: { name: true, slug: true } },
    brand: { select: { name: true, slug: true } },
    images: { where: { active: true }, orderBy: [{ primary: "desc" }, { sortOrder: "asc" }], take: 1, select: { url: true } },
    variants: { where: { active: true }, select: { stock: true, reservedQuantity: true } },
  } satisfies Prisma.ProductSelect;

  return Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, select }),
  ]).then(async ([total, items]) => {
    const sales = await prisma.orderItem.groupBy({
      by: ["productId"],
      where: { productId: { in: items.map((i) => i.id) } },
      _sum: { quantity: true, lineTotal: true },
    });
    const salesByProduct = new Map(sales.map((s) => [s.productId, { units: s._sum.quantity ?? 0, revenue: s._sum.lineTotal ?? 0 }]));
    return {
      items: items.map((p) => ({
        ...p,
        sales: salesByProduct.get(p.id) ?? { units: 0, revenue: 0 },
        available: availableStock(p.stock, p.reservedQuantity),
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
  });
});

// ─── Product detail ──────────────────────────────────────────────────────────

export const getAdminProduct = cache((id: string) =>
  prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      brand: true,
      variants: { orderBy: { createdAt: "asc" }, include: { images: { where: { active: true }, orderBy: [{ primary: "desc" }, { sortOrder: "asc" }] } } },
      images: { where: { active: true }, orderBy: [{ primary: "desc" }, { sortOrder: "asc" }] },
      inventoryMovements: { orderBy: { createdAt: "desc" }, take: 30, include: { profile: { select: { name: true, email: true } } } },
      reviews: { orderBy: { createdAt: "desc" } },
      orderItems: {
        select: { id: true, order: { select: { orderNumber: true, createdAt: true, status: true } }, quantity: true, unitPrice: true, lineTotal: true, variantInfo: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  })
);

export const getInventoryRows = cache(() =>
  prisma.product.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, sku: true, stock: true, reservedQuantity: true, lowStockThreshold: true, variants: { select: { id: true, name: true, sku: true, stock: true, reservedQuantity: true } } },
  })
);

export const getInventoryMovements = cache((take = 50) =>
  prisma.inventoryMovement.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { product: { select: { id: true, name: true, slug: true } }, variant: { select: { name: true } }, profile: { select: { name: true, email: true } } },
  })
);

// ─── Dashboard metrics ───────────────────────────────────────────────────────

export const getProductStats = cache(async () => {
  const [total, active, archived, lowStock, inventoryValue, sold] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { status: "ACTIVE" } }),
    prisma.product.count({ where: { status: "ARCHIVED" } }),
    prisma.product.count({ where: { status: { not: "ARCHIVED" }, stock: { lte: prisma.product.fields.lowStockThreshold } } }),
    prisma.product.aggregate({ where: { status: { not: "ARCHIVED" } }, _sum: { stock: true, costPrice: true } }),
    prisma.orderItem.aggregate({ _sum: { quantity: true } }),
  ]);
  return {
    total,
    active,
    outOfStock: await prisma.product.count({ where: { status: { not: "ARCHIVED" }, AND: [{ stock: { lte: 0 } }, { variants: { none: { active: true, stock: { gt: 0 } } } }] } }),
    archived,
    lowStock,
    inventoryValue: (inventoryValue._sum.stock ?? 0) * (inventoryValue._sum.costPrice ?? 0),
    productsSold: sold._sum.quantity ?? 0,
  };
});

export const getTopProducts = cache(async (take = 5) => {
  const sales = (await prisma.orderItem.groupBy({
    by: ["productId"],
    _sum: { quantity: true, lineTotal: true },
    orderBy: { _sum: { quantity: "desc" } },
    take,
  })).filter((s): s is typeof s & { productId: string } => s.productId !== null);
  const products = await prisma.product.findMany({
    where: { id: { in: sales.map((s) => s.productId) } },
    select: { id: true, name: true, slug: true, price: true, images: { where: { active: true }, orderBy: { primary: "desc" }, take: 1, select: { url: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return sales
    .map((s) => {
      const p = byId.get(s.productId);
      return p ? { ...p, units: s._sum.quantity ?? 0, revenue: s._sum.lineTotal ?? 0 } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
});