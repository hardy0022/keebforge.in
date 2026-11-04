import type { Metadata } from "next";
import { HomeHero } from "@/components/home/HomeHero";
import { ServicesTicker } from "@/components/home/ServicesTicker";
import { WorkshopPin } from "@/components/home/WorkshopPin";
import { FeaturedBuild } from "@/components/home/FeaturedBuild";
import { ModsWorkshop } from "@/components/home/ModsWorkshop";
import { CustomerReviews } from "@/components/home/CustomerReviews";
import { FinalCta } from "@/components/home/FinalCta";
import { getHomeData } from "@/lib/home";
import { buildMetadata } from "@/lib/seo";
import { DIWALI_CAMPAIGN, isCampaignActive } from "@/lib/config/campaign";

export const metadata: Metadata = buildMetadata({
  title: "KeebForge — Mechanical Keyboard & Mouse Repair in India",
  description:
    "Mechanical keyboard and mouse repair, soldering, switch lubing, stabilizer tuning and custom builds. India-wide mail-in service.",
  image: "/hero-background.webp",
});

export default async function HomePage() {
  const { products, work, reviews } = await getHomeData();
  const showDiwali = isCampaignActive() && DIWALI_CAMPAIGN.heroAnimationEnabled;

  return (
    <main className="hp-root">
      <HomeHero showDiwali={showDiwali} />
      <ServicesTicker />
      <WorkshopPin />
      {products.length > 0 && <FeaturedBuild products={products} />}
      <ModsWorkshop work={work} />
      <CustomerReviews reviews={reviews} />
      <FinalCta />
    </main>
  );
}
