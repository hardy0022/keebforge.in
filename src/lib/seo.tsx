import type { Metadata } from "next";

export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** Absolute URLs regardless of whether the source is a full URL or a path. */
export function toAbsUrl(u: string): string {
  return /^https?:\/\//i.test(u) ? u : `${SITE_URL}${u}`;
}

type SEOInput = {
  title: string;
  description: string;
  path?: string;
  /** Canonical override — defaults to SITE_URL + path. */
  canonical?: string;
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
  canonical,
  image = "",
  type = "website",
  robots = "index, follow, max-image-preview:large",
  noIndex = false,
}: SEOInput): Metadata {
  const canonicalUrl = canonical ?? (path ? `${SITE_URL}${path}` : SITE_URL);
  const ogImages = image
    ? [
        {
          url: toAbsUrl(image),
          width: 1200,
          height: 630,
          alt: "KeebForge.in",
        },
      ]
    : undefined;
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    robots: noIndex ? "noindex, nofollow" : robots,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: "KeebForge.in",
      locale: "en_IN",
      type,
      images: ogImages,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [toAbsUrl(image)] : undefined,
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
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", ...block }),
      }}
    />
  ));
}

export function breadcrumbJsonLd(
  items: { name: string; path: string }[],
): JsonLd {
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
