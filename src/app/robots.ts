import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/account", "/profile", "/shop/checkout", "/mods/checkout", "/order/", "/api/", "/track"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}