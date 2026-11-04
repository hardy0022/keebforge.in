import type { Metadata } from "next";
import Link from "next/link";
import { FaqCategory } from "@/components/faq/FaqCategory";
import { buildMetadata, JsonLd } from "@/lib/seo";
import { FAQ_CATEGORIES, GENERAL_FAQ } from "@/lib/faq";

export const metadata: Metadata = buildMetadata({
  title: "FAQ — Keyboard & Mouse Repair in India | KeebForge",
  description:
    "Frequently asked questions about orders, payments, shipping, repairs/custom work, accounts, privacy, and data rights at KeebForge.in.",
  path: "/faq",
});

const FAQ_SECTIONS = FAQ_CATEGORIES.map((category) => ({
  ...category,
  items: GENERAL_FAQ.filter((item) => item.category === category.id),
})).filter((category) => category.items.length > 0);

export default function FaqPage() {
  return (
    <main className="faq-page">
      <header className="faq-hero">
        <div className="wrap faq-wrap">
          <div className="faq-hero-inner">
            <p className="sec-num">{"// FAQ"}</p>
            <h1 className="faq-hero-title">Frequently Asked Questions</h1>
            <p className="faq-hero-desc">
              Everything customers usually ask about orders, services, shipping,
              payments, accounts, and privacy.
            </p>
            <div className="faq-pills" aria-label="Service highlights">
              {[
                "Mail-in service across India",
                "Payment before work begins",
                "Quotes after inspection",
              ].map((pill) => (
                <span key={pill} className="faq-pill">
                  {pill}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className="faq-content" aria-label="Frequently asked questions">
        <div className="wrap faq-wrap">
          <div className="faq-sections">
            {FAQ_SECTIONS.map((section, index) => (
              <FaqCategory
                key={section.id}
                id={section.id}
                index={index + 1}
                title={section.title}
                items={section.items}
              />
            ))}
          </div>

          <section className="faq-support" aria-labelledby="faq-support-title">
            <div className="faq-support-copy">
              <span className="faq-support-tag">Still have a question?</span>
              <h2 className="faq-support-title" id="faq-support-title">
                Can&apos;t find what you&apos;re looking for?
              </h2>
              <p>Contact us and we&apos;ll help you out.</p>
            </div>
            <Link href="/contact" className="btn-prime">
              Contact KeebForge
            </Link>
          </section>
        </div>
      </section>

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
    </main>
  );
}
