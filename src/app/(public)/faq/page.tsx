import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { FaqList } from "@/components/ui/FaqList";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata, JsonLd } from "@/lib/seo";
import { GENERAL_FAQ } from "@/lib/faq";

export const metadata: Metadata = buildMetadata({
  title: "FAQ — Keyboard & Mouse Repair in India | KeebForge",
  description:
    "Frequently asked questions about orders, payments, shipping, repairs/custom work, accounts, privacy, and data rights at KeebForge.in.",
  path: "/faq",
});

export default function FaqPage() {
  return (
    <main>
      <PageHero
        tag="FAQ"
        title="Frequently Asked Questions"
        desc="Everything customers usually ask about orders, services, shipping, payments, accounts, and privacy."
        pills={[
          "Mail-in service across India",
          "Payment before work begins",
          "Quotes after inspection",
        ]}
      />
      <FaqList items={GENERAL_FAQ} />
      <JsonLd
        data={{
          "@type": "FAQPage",
          mainEntity: GENERAL_FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />
      <CtaSection
        title={
          <>
            Place Your
            <br />
            Order Today
          </>
        }
        desc="Still unsure about something? Ask via our contact page or email — replies are fast."
      />
    </main>
  );
}
