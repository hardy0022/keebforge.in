import type { Metadata } from "next";
import { ShopCatalog } from "@/components/shop/ShopCatalog";
import { WhyForge } from "@/components/home/WhyForge";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Shop — Keyboards, Switches, Keycaps & Accessories | KeebForge",
  description:
    "Shop mechanical keyboard parts at KeebForge — custom orders, in-stock keyboards, switches, keycaps and clearance deals.",
  path: "/shop",
});

type Props = {
  searchParams: Promise<{ sort?: string; page?: string }>;
};

export default async function ShopPage({ searchParams }: Props) {
  const sp = await searchParams;

  return (
    <main className="shop-page">
      <section className="shop-hero">
        <div className="wrap">
          <span className="sec-num">{"// Shop"}</span>
          <h1 className="sec-title">Keyboard, Parts &amp; Accessories</h1>
          <p className="sec-desc shop-desc">
            Three ways to buy — <strong>Made to Order</strong> (custom products built specifically for you),{" "}
            <strong>Brand New</strong> (new products from KeebForge) and <strong>Clearance</strong>{" "}
            (discounted, open-box, used or older-stock items).
          </p>
        </div>
      </section>
      <section className="svc-section">
        <div className="wrap">
          <ShopCatalog searchParams={sp} />
        </div>
      </section>
      <WhyForge num="// Why Forge" />
    </main>
  );
}
