import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { InquiryForm } from "@/components/contact/InquiryForm";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Electronics Repair — KeebForge",
  description:
    "Component-level diagnosis and repair for keyboards, mice and general electronics. Send a repair inquiry with photos and KeebForge will assess your device and get back with a quote.",
  path: "/repair",
});

export default function RepairPage() {
  return (
    <main>
      <PageHero
        tag="Repair"
        title="Electronics Repair"
        desc="Component-level diagnosis and repair for keyboards, mice and general electronics. Tell us what's wrong, show us photos, and we'll assess it."
        pills={["Quote based", "Mail-in across India", "Photos welcome"]}
      />

      <section className="svc-section" aria-labelledby="t-repair">
        <div className="wrap">
          <div className="repair-layout">
            <article className="card card-q">
              <div className="ch">
                <span className="ci" aria-hidden="true">⚡</span>
                <span className="qbadge">Quote Based</span>
              </div>
              <h3 className="ct">Electronics Repair</h3>
              <p className="cd">
                Component-level repair and diagnostics for consumer electronics, PCBs, and modules. Fill in the
                inquiry form and we&apos;ll assess your device and get back with a quote.
              </p>
              <p className="cd" style={{ color: "var(--t3)", fontSize: "0.72rem", marginTop: 12 }}>
                Commonly repaired: keyboards, controllers, custom PCBs, microcontroller modules, and hobbyist
                electronics.
              </p>
            </article>

            <InquiryForm />
          </div>
        </div>
      </section>
    </main>
  );
}