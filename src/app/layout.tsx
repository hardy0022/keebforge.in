import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/Footer";
import { ShowOnSite } from "@/components/layout/ShowOnSite";
import { buildMetadata } from "@/lib/seo";
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

export const metadata: Metadata = buildMetadata({
  title: "Mechanical Keyboard & Mouse Repair in India | KeebForge",
  description:
    "Mechanical keyboard & gaming mouse repair across India — switch lubing, stabilizer tuning, soldering, PCB repair & custom builds. Mail-in service from anywhere in India.",
  path: "/",
});

export const viewport: Viewport = {
  themeColor: "#080a0c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${inter.variable} antialiased`}>
        <ShowOnSite>
          <SiteHeader />
        </ShowOnSite>
        {children}
        <ShowOnSite>
          <SiteFooter />
        </ShowOnSite>
      </body>
    </html>
  );
}