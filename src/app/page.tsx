import type { Metadata } from "next";
import { HomeHero } from "@/components/home/HomeHero";
import { ServicesTicker } from "@/components/home/ServicesTicker";
import { WorkshopPin } from "@/components/home/WorkshopPin";
import { FeaturedBuild } from "@/components/home/FeaturedBuild";
import { RecentWork } from "@/components/home/RecentWork";
import { ModsWorkshop } from "@/components/home/ModsWorkshop";
import { WhyKeebForge } from "@/components/home/WhyKeebForge";
import { CustomerReviews } from "@/components/home/CustomerReviews";
import { FinalCta } from "@/components/home/FinalCta";
import { getHomeData } from "@/lib/home";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "KeebForge — Mechanical Keyboard & Mouse Repair in India",
  description:
    "Mechanical keyboard and mouse repair, soldering, switch lubing, stabilizer tuning and custom builds. India-wide mail-in service.",
});

export default async function HomePage() {
  const { product, work, reviews } = await getHomeData();

  return (
    <main className="hp-root">
      <HomeHero />
      <ServicesTicker />
      <WorkshopPin />
      <FeaturedBuild product={product} />
      <RecentWork work={work} />
      <ModsWorkshop work={work} />
      <WhyKeebForge />
      <CustomerReviews reviews={reviews} />
      <FinalCta />
    </main>
  );
}