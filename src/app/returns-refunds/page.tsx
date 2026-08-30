import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { SupportSection, PolicyPlaceholder } from "@/components/support/SupportSection";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Returns & Refunds | KeebForge",
  description:
    "How to request help with a KeebForge order — return eligibility, rework and refund policy, damaged or incorrect items, and how to contact us.",
  path: "/returns-refunds",
});

export default function ReturnsRefundsPage() {
  return (
    <main>
      <PageHero
        tag="SUPPORT"
        title="Returns & Refunds"
        desc="How to get help with an order — what's covered, what isn't, and how to reach us. Built on the KeebForge Terms & Conditions."
      />

      <section className="svc-section">
        <div className="wrap">
          <div className="support-stack">
            <SupportSection title="Return eligibility" id="support-return-eligibility">
              <p>
                Every KeebForge build and repair is <strong>custom work</strong>, not a stocked product — so returns
                don&apos;t work like a typical shop. Custom work and repairs can&apos;t be cancelled or returned for a
                change of mind once work has begun, because parts and labor time are already committed.
              </p>
              <p>
                What we do stand behind is workmanship. If something we did is at fault, we&apos;ll make it right at no
                extra labor cost. KeebForge&apos;s approach is rework instead of refunds:
              </p>
              <ul>
                <li>Covered: A workmanship defect traceable to our work (e.g. a joint we soldered fails, a switch we lubed sticks).</li>
                <li>Covered: Damage while the hardware was in our care.</li>
                <li>Covered: An issue on arrival that doesn&apos;t match what was agreed.</li>
                <li>Not covered: change of mind, cosmetic variation, normal wear, or damage from misuse after we shipped back.</li>
              </ul>
              <p>
                Custom work and repairs are not eligible for change-of-mind refunds. See{" "}
                <a href="/terms">Terms &amp; Conditions §06</a> for the full wording.
              </p>
            </SupportSection>

            <SupportSection title="Refunds" id="support-refunds">
              <p>
                <strong>Custom work and repair orders:</strong> KeebForge doesn&apos;t offer refunds — workmanship issues
                are resolved by free rework instead (see above). Orders that fail before payment are never charged.
              </p>
              <p>
                <strong>Product orders</strong> (brand new, clearance or accessories) — a refund policy hasn&apos;t been
                published yet.
              </p>
              <PolicyPlaceholder>
                [PLACEHOLDER — product-order refund policy isn&apos;t defined yet. Replace this paragraph once a policy
                is confirmed.]
              </PolicyPlaceholder>
            </SupportSection>

            <SupportSection title="Damaged or incorrect items" id="support-damaged">
              <p>
                If an order arrives damaged, or doesn&apos;t match what you ordered, tell us. For shipped products and
                returned hardware this is handled case by case.
              </p>
              <PolicyPlaceholder>
                [PLACEHOLDER — no confirmed policy yet for damaged/incorrect shipments. Expected approach: report the
                issue within 48 hours of delivery with photos, and we&apos;ll arrange a replacement or solution.]
              </PolicyPlaceholder>
            </SupportSection>

            <SupportSection title="How to request a return or report an issue" id="support-how-to">
              <ul>
                <li>Contact KeebForge within <strong>48 hours of delivery</strong>.</li>
                <li>Share clear photos or a short video showing the issue.</li>
                <li>Keep the item unused beyond normal testing until we confirm next steps.</li>
                <li>Use the <a href="/contact">contact page</a> or email <a href="mailto:contact@keebforge.in">contact@keebforge.in</a>.</li>
              </ul>
            </SupportSection>

            <SupportSection title="Refund processing time" id="support-processing">
              <p>
                Because KeebForge resolves issues with rework rather than refunds, there&apos;s no standard refund
                timeline for custom work.
              </p>
              <PolicyPlaceholder>
                [PLACEHOLDER — if a product-order refund is issued in the future, it would be sent back to the original
                payment method, with timing set by the payment provider and bank.]
              </PolicyPlaceholder>
            </SupportSection>

            <SupportSection title="Policy source" id="support-source">
              <p>
                The workmanship and rework policy above is the <a href="/terms">Terms &amp; Conditions §06</a>.
                Anything marked as a placeholder isn&apos;t an established KeebForge policy yet.
              </p>
            </SupportSection>
          </div>
        </div>
      </section>

      <CtaSection title={<>Need Help With an Order?</>} desc="Reach out and we'll make it right — replies are fast." primaryLabel="Contact Us" primaryHref="/contact" />
    </main>
  );
}