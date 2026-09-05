import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/ui/PageHero";
import { TrackOrder } from "@/components/support/TrackOrder";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Track Your Order & Repair Status | KeebForge",
  description:
    "Track your KeebForge order by order number — see the latest workshop and shipping status of your keyboard or mouse order from Jammu & Kashmir to anywhere in India.",
  path: "/track-order",
});

export default async function TrackOrderPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;
  return (
    <main className="track-page">
      <PageHero
        tag="// SUPPORT"
        title="Track your order."
        desc="Enter your order number below to see the latest status of your KeebForge order — from order placed to delivered."
      />
      <TrackOrder initialOrder={order} />
      <div className="track-help-panel wrap">
        <div className="track-help-card">
          <div>
            <p className="track-help-title">Need help?</p>
            <p className="track-help-desc">
              Something wrong with your order, or can&apos;t find what you&apos;re looking for?
            </p>
          </div>
          <Link href="/contact" className="btn-prime">
            Contact Us
          </Link>
        </div>
      </div>
    </main>
  );
}