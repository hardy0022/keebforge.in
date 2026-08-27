import type { Metadata } from "next";
import { ShopCatalog } from "@/components/shop/ShopCatalog";
import { WhyForge } from "@/components/home/WhyForge";
import { buildMetadata } from "@/lib/seo";
import { SECTION_LABELS } from "@/lib/shop";

export const metadata: Metadata = buildMetadata({
  title: "Clearance — Shop | KeebForge",
  description: "Discounted, open-box and used keyboard gear at KeebForge.",
  path: "/shop/clearance",
});

type Props = {
  searchParams: Promise<{ sort?: string; page?: string }>;
};

export default async function ClearancePage({ searchParams }: Props) {
  const sp = await searchParams;
  const meta = SECTION_LABELS.CLEARANCE;

  return (
    <main className="shop-page">
      <section className="shop-hero">
        <div className="wrap">
          <span className="sec-num">{"// Shop"}</span>
          <h1 className="sec-title">{meta.title}</h1>
          <p className="sec-desc shop-desc">{meta.blurb}</p>
        </div>
      </section>
      <section className="svc-section">
        <div className="wrap">
          <ShopCatalog section="clearance" searchParams={sp} />
        </div>
      </section>
      <WhyForge num="// Why Forge" />
    </main>
  );
}
