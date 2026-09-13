import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { TAG, TTL, defineCached } from "@/lib/caching/cache";

/** Review photos live in the generic Media table (entityType REVIEW). */
export type ReviewWithImages = Omit<
  Prisma.ReviewGetPayload<{ include: { profile: true } }>,
  "profile"
> & {
  profile: { id: string; name: string | null; avatarUrl: string | null } | null;
  images: {
    id: string;
    url: string;
    width: number | null;
    height: number | null;
  }[];
};

export const REVIEW_PAGE_SIZE = 8;
export const MAX_REVIEW_IMAGES = 4;

/** Aggregate rating summary for a product, from APPROVED PRODUCT reviews only. */
export const getReviewSummary = defineCached(
  (productId: string) =>
    prisma.review
      .aggregate({
        where: { productId, type: "PRODUCT", status: "APPROVED" },
        _avg: { rating: true },
        _count: { _all: true },
      })
      .then((r) => ({
        count: r._count._all,
        average: r._avg.rating ?? null,
      })),
  { tags: [TAG.reviews], revalidate: TTL.reviews, keys: ["review-summary"] },
);

/** Per-star distribution (5 → 1) for the review-summary bars. */
export const getReviewDistribution = defineCached(
  async (productId: string) => {
    const rows = await prisma.review.groupBy({
      by: ["rating"],
      where: { productId, type: "PRODUCT", status: "APPROVED" },
      _count: { _all: true },
    });
    const dist = [0, 0, 0, 0, 0]; // index 0 = 5★ … index 4 = 1★
    for (const r of rows)
      if (r.rating >= 1 && r.rating <= 5) dist[5 - r.rating] = r._count._all;
    return dist;
  },
  {
    tags: [TAG.reviews],
    revalidate: TTL.reviews,
    keys: ["review-distribution"],
  },
);

/** Paginated APPROVED reviews (DB-level), newest first, with photo media. */
async function reviewsPage(
  where: Prisma.ReviewWhereInput,
  opts: { page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? REVIEW_PAGE_SIZE;
  const [total, items] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      // Only what ReviewCard renders (name + avatar) plus id for the
      // verified-buyer lookup — a full Profile row is pointless payload.
      include: { profile: { select: { id: true, name: true, avatarUrl: true } } },
    }),
  ]);
  const media = await prisma.media.findMany({
    where: { entityType: "REVIEW", entityId: { in: items.map((r) => r.id) } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const byReview = new Map<string, typeof media>();
  for (const m of media) {
    const list = byReview.get(m.entityId) ?? [];
    list.push(m);
    byReview.set(m.entityId, list);
  }
  const reviews: ReviewWithImages[] = items.map((r) => ({
    ...r,
    images: (byReview.get(r.id) ?? []).map((m) => ({
      id: m.id,
      url: m.secureUrl,
      width: m.width,
      height: m.height,
    })),
  }));
  return {
    items: reviews,
    total,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Paginated APPROVED product reviews (DB-level), newest first. */
export const getProductReviews = defineCached(
  (productId: string, opts: { page?: number; pageSize?: number } = {}) =>
    reviewsPage(
      { productId, type: "PRODUCT", status: "APPROVED" },
      { page: opts.page ?? 1, pageSize: opts.pageSize ?? REVIEW_PAGE_SIZE },
    ),
  { tags: [TAG.reviews], revalidate: TTL.reviews, keys: ["product-reviews"] },
);

/** Site-wide customer feed for /work: APPROVED product + general reviews. */
export const getPublicReviews = defineCached(
  (opts: { page?: number; pageSize?: number } = {}) =>
    reviewsPage(
      { status: "APPROVED", type: { in: ["PRODUCT", "GENERAL"] } },
      { page: opts.page ?? 1, pageSize: opts.pageSize ?? REVIEW_PAGE_SIZE },
    ),
  { tags: [TAG.reviews], revalidate: TTL.reviews, keys: ["public-reviews"] },
);

/** Site-wide rating summary (5 → 1 distribution) for approved product+general reviews. */
export const getSiteReviewSummary = defineCached(
  async () => {
    const [agg, rows] = await Promise.all([
      prisma.review.aggregate({
        where: { status: "APPROVED", type: { in: ["PRODUCT", "GENERAL"] } },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      prisma.review.groupBy({
        by: ["rating"],
        where: { status: "APPROVED", type: { in: ["PRODUCT", "GENERAL"] } },
        _count: { _all: true },
      }),
    ]);
    const distribution = [0, 0, 0, 0, 0]; // index 0 = 5★ … index 4 = 1★
    for (const r of rows)
      if (r.rating >= 1 && r.rating <= 5) distribution[5 - r.rating] = r._count._all;
    return {
      count: agg._count._all,
      average: agg._avg.rating ?? null,
      distribution,
    };
  },
  {
    tags: [TAG.reviews],
    revalidate: TTL.reviews,
    keys: ["site-review-summary"],
  },
);

/** Reviewer profile ids that have a fulfilled order containing this product. */
export async function verifiedProfileIds(
  productId: string,
  profileIds: string[],
): Promise<Set<string>> {
  const ids = profileIds.filter(Boolean);
  if (ids.length === 0) return new Set();
  const rows = await prisma.order.findMany({
    where: {
      profileId: { in: ids },
      isDeleted: false,
      status: {
        in: ["ORDER_COMPLETED", "DELIVERED", "TESTING_WARRANTY_ACTIVE"],
      },
      items: { some: { productId } },
    },
    select: { profileId: true },
  });
  return new Set(rows.map((r) => r.profileId).filter((p): p is string => !!p));
}

/**
 * Recompute the product's real ratingAverage/ratingCount from APPROVED product
 * reviews. Never fabricated — always derived from live rows.
 */
export async function recalcProductRating(productId: string): Promise<void> {
  const agg = await prisma.review.aggregate({
    where: { productId, type: "PRODUCT", status: "APPROVED" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await prisma.product.update({
    where: { id: productId },
    data: {
      ratingAverage: agg._avg.rating,
      ratingCount: agg._count._all,
    },
  });
}
