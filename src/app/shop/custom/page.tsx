import type { Metadata } from "next";
import { ShopCatalog } from "@/components/shop/ShopCatalog";
import { WhyForge } from "@/components/home/WhyForge";
import { buildMetadata } from "@/lib/seo";
import { SECTION_LABELS } from "@/lib/shop";

export const metadata: Metadata = buildMetadata({
  title: "Custom Orders — Shop | KeebForge",
  description: "Made-to-order keyboards, switches and custom work, built specifically for you.",
  path: "/shop/custom",
});

type Props = {
  searchParams: Promise<{ sort?: string; page?: string }>;
};

export default async function CustomShopPage({ searchParams }: Props) {
  const sp = await searchParams;
  const meta = SECTION_LABELS.CUSTOM;

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
          <ShopCatalog section="custom" searchParams={sp} />
        </div>
      </section>
      <WhyForge num="// Why Forge" />
    </main>
  );
}
