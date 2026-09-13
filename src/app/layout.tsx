import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import { buildMetadata, JsonLd, SITE_URL } from "@/lib/seo";
import { SiteChrome } from "@/components/layout/SiteChrome";
import { SiteFooter } from "@/components/layout/Footer";
import Analytics from "@/components/Analytics";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  ...buildMetadata({
    title: "Mechanical Keyboard & Mouse Repair in India | KeebForge",
    description:
      "Mechanical keyboard & gaming mouse repair across India — switch lubing, stabilizer tuning, soldering, PCB repair & custom builds. Mail-in service from anywhere in India.",
    path: "/",
  }),
  metadataBase: new URL(SITE_URL),
};

export const viewport: Viewport = {
  themeColor: "#080a0c",
};

// Sitewide factual Organization + WebSite markup (name, URL, contact and
// public socials only — nothing private or inferred).
const SITE_JSONLD = [
  {
    "@type": "Organization",
    name: "KeebForge.in",
    url: SITE_URL,
    email: "contact@keebforge.in",
    foundingLocation: { addressLocality: "Jammu and Kashmir", addressCountry: "IN" },
    areaServed: { "@type": "Country", name: "India" },
    sameAs: [
      "https://discord.com/users/843113968734437376",
      "https://www.reddit.com/user/hardy_022/",
      "https://www.instagram.com/nowitshardik/",
      "https://github.com/hardy0022",
    ],
  },
  {
    "@type": "WebSite",
    name: "KeebForge.in",
    url: SITE_URL,
  },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${spaceGrotesk.variable} ${inter.variable}`}
    >
      <body className="antialiased page-layout">
        <JsonLd data={SITE_JSONLD} />
        <SiteChrome footer={<SiteFooter />}>{children}</SiteChrome>
        <Analytics />
      </body>
    </html>
  );
}
