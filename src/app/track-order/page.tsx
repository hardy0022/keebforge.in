import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { TrackOrder } from "@/components/support/TrackOrder";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Track Your Order & Repair Status | KeebForge",
  description:
    "Track your KeebForge order by order number — see the latest workshop and shipping status of your keyboard or mouse order from Jammu & Kashmir to anywhere in India.",
  path: "/track-order",
});

export default function TrackOrderPage() {
  return (
    <main className="track-page">
      <PageHero
        tag="SUPPORT"
        title="Track your order."
        desc="Enter your order number below to see the latest status of your KeebForge order — from order placed to delivered."
      />
      <TrackOrder />
      <CtaSection
        tag="// Need Help?"
        title={<>Need help with your order?</>}
        desc="Can't find your order number, or something doesn't look right? Send us a message and we'll look it up for you."
        primaryLabel="Contact Us"
        primaryHref="/contact"
      />
    </main>
  );
}