import type { Metadata } from "next";

export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

type SEOInput = {
  title: string;
  description: string;
  path?: string;
  image?: string;
  type?: "website" | "article";
  robots?: string;
  noIndex?: boolean;
};

/** Reusable metadata builder — canonical URLs + OG + Twitter in one place. */
export function buildMetadata({
  title,
  description,
  path = "",
  image = "/images/banner.webp",
  type = "website",
  robots = "index, follow, max-image-preview:large",
  noIndex = false,
}: SEOInput): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    title,
    description,
    alternates: { canonical: path ? url : SITE_URL },
    robots: noIndex ? "noindex, nofollow" : robots,
    openGraph: {
      title,
      description,
      url,
      siteName: "KeebForge.in",
      locale: "en_IN",
      type,
      images: [{ url: `${SITE_URL}${image}`, width: 1200, height: 630, alt: "KeebForge.in" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${SITE_URL}${image}`],
    },
  };
}

type JsonLd = Record<string, unknown>;

/** Render JSON-LD blocks inside a <head>-compatible script tag. */
export function JsonLd({ data }: { data: JsonLd | JsonLd[] }) {
  const blocks = Array.isArray(data) ? data : [data];
  return blocks.map((block, i) => (
    <script
      key={i}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", ...block }) }}
    />
  ));
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): JsonLd {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}