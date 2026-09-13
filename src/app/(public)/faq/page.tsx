import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { FaqList } from "@/components/ui/FaqList";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata, JsonLd } from "@/lib/seo";
import { GENERAL_FAQ } from "@/lib/faq";

export const metadata: Metadata = buildMetadata({
  title: "FAQ — Keyboard & Mouse Repair in India | KeebForge",
  description:
    "Everything customers usually ask before sending in a keyboard or mouse for service — what gets repaired, how ordering and shipping work, pricing and payment.",
  path: "/faq",
});

export default function FaqPage() {
  return (
    <main>
      <PageHero
        tag="FAQ"
        title="Frequently Asked Questions"
        desc="Everything customers usually ask before sending in a keyboard or mouse for service — what gets repaired, how ordering and shipping work, pricing and payment."
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
        desc="Still unsure about something? Ask on Discord or email — replies are fast."
      />
    </main>
  );
}
