import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/seo";

const STATIC: { path: string; changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"]; priority?: number }[] = [
  { path: "/", priority: 1 },
  { path: "/shop", priority: 0.9 },
  { path: "/services", priority: 0.9 },
  { path: "/repair/keyboard", priority: 0.8 },
  { path: "/repair/mouse", priority: 0.8 },
  { path: "/about", priority: 0.5 },
  { path: "/faq", priority: 0.5 },
  { path: "/work", priority: 0.7 },
  { path: "/contact", priority: 0.5 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [services, products, work] = await Promise.all([
    prisma.service.findMany({ where: { active: true }, select: { slug: true, device: true, updatedAt: true } }),
    prisma.product.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }),
    prisma.workProject.findMany({ where: { active: true }, select: { slug: true, updatedAt: true } }),
  ]);

  const serviceUrls = services.map((s) => ({
    url: `${SITE_URL}/services/${s.device === "MOUSE" ? "mouse" : "keyboard"}/${s.slug}`,
    lastModified: s.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const productUrls = products.map((p) => ({
    url: `${SITE_URL}/product/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.8,
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

  return [...staticUrls, ...serviceUrls, ...productUrls, ...workUrls];
}