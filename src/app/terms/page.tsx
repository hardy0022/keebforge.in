import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { SectionHead } from "@/components/ui/SectionHead";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Terms & Conditions | KeebForge",
  description:
    "Terms covering custom keyboard builds, switch modification, PCB design and electronics repair services booked through KeebForge.in.",
  path: "/terms",
});

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "01 — Service Overview",
    body: [
      "KeebForge.in provides mechanical keyboard assembly, switch lubing and modification, component soldering and desoldering, stabilizer tuning, custom PCB design, and component-level electronics diagnostics and repair. By placing an order or sending in a mail-in service request, you agree to these terms in full.",
    ],
  },
  {
    title: "02 — Orders & Payments",
    body: [
      "All prices are listed in INR. Quote-based services are confirmed before work begins.",
      "Payment is collected before work begins — it books any parts needed and secures the order, so work only starts once payment is confirmed.",
      "Optional work-in-progress photos/test clips are available on request via Discord or email.",
      "Once work has started on a custom build or repair, orders cannot be cancelled, as parts and labor time have already been committed.",
    ],
  },
  {
    title: "03 — Shipping & Logistics",
    body: [
      "The customer is responsible for all shipping arrangements and costs, in both directions.",
      "You pack and ship parts safely. Return shipping costs must be settled before completed hardware is shipped back to you.",
      "Shipping timelines are estimates. KeebForge.in is not responsible for delays, loss, or damage caused by external logistics providers.",
    ],
  },
  {
    title: "04 — Component Compatibility",
    body: [
      "You are responsible for confirming that any parts you send — switches, plates, keycaps, stabilizers, PCBs, or case shells — are compatible with your intended build before shipping them to us.",
      "If an incompatibility is found mid-build, work pauses and you are contacted. Labor hours already spent up to that point will still be included in your final invoice.",
    ],
  },
  {
    title: "05 — Turnaround & Queue",
    body: [
      "Standard turnaround is 5–7 business days from when your parts are checked into the workshop queue. This can shift depending on queue length, diagnostic complexity, or delays validating parts.",
    ],
  },
  {
    title: "06 — Post-Delivery Issues & Rework",
    body: [
      "Because every build and repair is custom work rather than a stocked product, we don't offer refunds — but we stand by our workmanship. If something we did is at fault, we'll make it right at no extra labor cost.",
      "Covered for free rework: a workmanship defect traceable to our work (e.g. a joint we soldered fails, a switch we lubed sticks); damage while in our care; an issue on arrival that doesn't match what was agreed.",
      "To request rework: contact within 48 hours of delivery, share photos or a short video, and keep the item unused beyond normal testing.",
      "Not covered: change of mind; normal wear, minor cosmetic variation, or hand-assembly tolerances; damage from misuse, liquid exposure, or modifications made after we shipped it back; failure of parts you supplied that were already faulty or worn before reaching us.",
    ],
  },
  {
    title: "07 — Warranty & Liability",
    body: [
      "Modification and repair work naturally voids most factory warranties on the components involved.",
      "Liability is limited to reworking or replacing the specific service or component affected — not the full build, and not consequential costs beyond that.",
      "Diagnosing and repairing circuit-level faults carries inherent risk — heat and handling can affect components that are already worn or oxidized. We follow careful thermal-control practices, but can't guarantee survival for heavily degraded traces or controllers going in.",
    ],
  },
  {
    title: "08 — Intellectual Property",
    body: [
      "Photos, write-ups, and designs shown on KeebForge.in belong to KeebForge.in unless otherwise credited, and shouldn't be reused commercially without permission. Open-source hardware projects we host, like community group buys, remain under whatever license their own repository specifies.",
    ],
  },
  {
    title: "09 — Governing Law",
    body: [
      "These terms are governed by the laws of India. Any disputes arising from services booked through KeebForge.in are subject to the jurisdiction of the courts of Jammu & Kashmir, India.",
    ],
  },
];

export default function TermsPage() {
  return (
    <main>
      <PageHero
        tag="Terms & Conditions"
        title="Terms & Conditions"
        desc="Last updated: July 2026. These terms cover custom keyboard builds, switch modification, PCB design, and electronics repair services booked through KeebForge.in. By submitting an order or mail-in service request, you agree to the terms below."
      />

      <section className="svc-section" aria-labelledby="t-terms">
        <div className="wrap">
          <div className="flex flex-col gap-3 max-w-[760px]">
            {SECTIONS.map((s) => (
              <details className="faq" key={s.title} open>
                <summary>
                  {s.title}
                  <span className="faq-ico" aria-hidden="true">
                    +
                  </span>
                </summary>
                <div className="faq-body">
                  {s.body.map((p, i) => (
                    <p key={i} className={i > 0 ? "mt-3" : undefined}>
                      {p}
                    </p>
                  ))}
                </div>
              </details>
            ))}
          </div>

          <div className="mt-10">
            <SectionHead title="Questions About These Terms?" desc="Reach out any time — email replies are fast." />
            <a href="mailto:contact@keebforge.in" className="btn-prime">
              Email Us: contact@keebforge.in
            </a>
          </div>
        </div>
      </section>

      <CtaSection title={<>Place Your Order Today</>} />
    </main>
  );
}