import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { ServiceTable } from "@/components/services/ServiceTable";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata } from "@/lib/seo";
import { getServiceCatalog } from "@/lib/data";

export const metadata: Metadata = buildMetadata({
  title: "Keyboard & Mouse Service Pricing | KeebForge",
  description:
    "Clear, upfront pricing for every KeebForge service — switch lubing, stabilizer tuning, soldering, builds, PCB work and mouse repairs. Fixed rates listed; quote-based work confirmed after inspection.",
  path: "/services",
});

export default async function ServicesPage() {
  const groups = await getServiceCatalog();

  return (
    <main>
      <PageHero
        tag="Services & Pricing"
        title="Keyboard & Mouse Service Pricing"
        desc="Clear, upfront pricing for every KeebForge service. Fixed-price work is billed per the rates below; anything that depends on the condition of your board or device is quoted after inspection."
        pills={["Fixed prices shown", "Quote-based work listed", "Payment before work begins"]}
      />

      {groups.map((g, i) => (
        <ServiceTable key={g.id} group={g} num={`0${i + 1} // ${g.device === "MOUSE" ? "Mouse" : "Keyboard"}`} />
      ))}

      <section className="svc-section" aria-labelledby="how-pricing-works">
        <div className="wrap">
          <div className="card max-w-[760px]">
            <h3 className="ct">How Pricing Works</h3>
            <p className="cd" style={{ marginBottom: 12 }}>
              Fixed-price services are billed per the rates above, so you know the cost up front. Services where the
              work depends on the condition of your board — PCB troubleshooting, electronics repair, split and fully
              bespoke builds, firmware work and mouse repairs — are{" "}
              <strong style={{ color: "var(--t1)" }}>quoted after inspection</strong>: describe the issue when you
              order, and KeebForge confirms a price before starting.
            </p>
            <p className="cd">
              Payment is confirmed before work begins — this books any parts needed and secures the order — and the
              buyer covers shipping in both directions. Bulk orders are priced negotiably.
            </p>
          </div>
        </div>
      </section>

      <CtaSection
        title={
          <>
            Place Your
            <br />
            Order Today
          </>
        }
        desc="Fixed-price services can be ordered directly. Quote-based work is assessed and confirmed before anything starts."
      />
    </main>
  );
}