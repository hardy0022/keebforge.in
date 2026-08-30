import "server-only";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPublicReviews, getSiteReviewSummary } from "@/lib/reviews";

const PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  price: true,
  compareAtPrice: true,
  description: true,
  category: { select: { name: true } },
  images: {
    where: { active: true },
    orderBy: [{ primary: "desc" }, { sortOrder: "asc" }],
    select: { url: true, alt: true },
  },
} satisfies Prisma.ProductSelect;

export type HomeProduct = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

export type HomeWork = {
  id: string;
  title: string;
  slug: string;
  category: string;
  images: { url: string; alt?: string }[];
};

export type HomeData = {
  products: HomeProduct[];
  work: HomeWork[];
  reviews: {
    summary: Awaited<ReturnType<typeof getSiteReviewSummary>>;
    items: Awaited<ReturnType<typeof getPublicReviews>>["items"];
  };
};

const HOME_WORK_TAKE = 5;
const HOME_FEATURE_TAKE = 4;

/** One cached fetch for the whole homepage: featured products, work, reviews, services. */
export const getHomeData = cache(async (): Promise<HomeData> => {
  const featured = await prisma.product.findMany({
    where: { featured: true, active: true, status: "ACTIVE", images: { some: { active: true } } },
    orderBy: { createdAt: "desc" },
    take: HOME_FEATURE_TAKE,
    select: PRODUCT_SELECT,
  });

  // ponytail: dev DB has no `featured` products — fall back to newest ACTIVE
  // products with imagery so the homepage never renders an empty showcase.
  const products =
    featured.length > 0
      ? featured
      : await prisma.product.findMany({
          where: { active: true, status: "ACTIVE", images: { some: { active: true } } },
          orderBy: { createdAt: "desc" },
          take: HOME_FEATURE_TAKE,
          select: PRODUCT_SELECT,
        });

  const [work, [summary, feed]] = await Promise.all([
    prisma.workProject.findMany({
      where: { active: true },
      orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
      take: HOME_WORK_TAKE,
      select: { id: true, title: true, slug: true, category: true, images: true },
    }),
    Promise.all([getSiteReviewSummary(), getPublicReviews({ page: 1, pageSize: 8 })]),
  ]);

  return {
    products,
    work: work.map((w) => ({
      ...w,
      images: (Array.isArray(w.images) ? w.images : []) as { url: string; alt?: string }[],
    })),
    reviews: { summary, items: feed.items },
  };
});