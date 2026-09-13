import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { SITE_URL } from "@/lib/seo";
import { cldUrl } from "@/lib/images/cloudinary-url";
import { TAG, TTL } from "@/lib/caching/cache";

const STATIC: {
  path: string;
  changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority?: number;
}[] = [
  { path: "/", priority: 1 },
  { path: "/shop", priority: 0.9 },
  { path: "/shop/products", priority: 0.7 },
  { path: "/shop/clearance", priority: 0.7 },
  { path: "/shop/custom", priority: 0.7 },
  { path: "/mods", priority: 0.9 },
  { path: "/workshop", priority: 0.8 },
  { path: "/about", priority: 0.5 },
  { path: "/faq", priority: 0.5 },
  { path: "/work", priority: 0.7 },
  { path: "/contact", priority: 0.5 },
  { path: "/track-order", priority: 0.5 },
  { path: "/privacy-policy", priority: 0.4 },
  { path: "/terms", priority: 0.4 },
  { path: "/shipping-information", priority: 0.4 },
  { path: "/returns-refunds", priority: 0.4 },
];

const getDynamicUrls = unstable_cache(
  async () => {
    const [products, categories, work] = await Promise.all([
      prisma.product.findMany({
        where: { active: true },
        select: {
          slug: true,
          updatedAt: true,
          images: {
            where: { active: true, primary: true },
            select: { url: true },
            take: 1,
          },
        },
      }),
      prisma.category.findMany({
        where: { active: true },
        select: { slug: true, createdAt: true },
      }),
      prisma.workProject.findMany({
        where: { active: true },
        select: { slug: true, updatedAt: true },
      }),
    ]);

    return { products, categories, work };
  },
  ["sitemap-dynamic"],
  { tags: [TAG.products, TAG.categories, TAG.work], revalidate: TTL.catalog },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products, categories, work } = await getDynamicUrls();

  const productUrls = products.map((p) => ({
    url: `${SITE_URL}/product/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.8,
    images: p.images[0]
      ? [cldUrl(p.images[0].url, 800)]
      : undefined,
  }));

  const categoryUrls = categories.map((c) => ({
    url: `${SITE_URL}/shop/${c.slug}`,
    lastModified: c.createdAt,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const workUrls = work.map((w) => ({
    url: `${SITE_URL}/work/${w.slug}`,
    lastModified: w.updatedAt,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  const staticUrls = STATIC.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified: new Date(),
    changeFrequency: p.changeFrequency ?? ("monthly" as const),
    priority: p.priority ?? 0.5,
  }));

  return [...staticUrls, ...categoryUrls, ...productUrls, ...workUrls];
}