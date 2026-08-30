import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { SupportSection } from "@/components/support/SupportSection";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Shipping Information | KeebForge",
  description:
    "How KeebForge shipping works — coverage across India, processing and build time, how orders are dispatched, tracking, and delivery estimates.",
  path: "/shipping-information",
});

export default function ShippingInformationPage() {
  return (
    <main>
      <PageHero
        tag="SUPPORT"
        title="Shipping Information"
        desc="How ordering, processing and delivery work for KeebForge orders — shipped from Jammu & Kashmir to anywhere in India."
      />

      <section className="svc-section">
        <div className="wrap">
          <div className="support-stack">
            <SupportSection title="Shipping coverage" id="support-coverage">
              <p>
                KeebForge is a mail-in service that ships across India. There is no physical walk-in shop — your
                keyboard, mouse, or order is shipped in and shipped back. Product orders are delivered by our logistics
                partner (Delhivery) to pincodes across the country.
              </p>
              <p>
                For repairs and custom work, you ship your device to us in Jammu &amp; Kashmir, and we ship the finished
                hardware back to you.
              </p>
            </SupportSection>

            <SupportSection title="Processing & build time" id="support-co">
              <ul>
                <li>
                  <strong>Product orders</strong> are typically prepared and dispatched within 1–2 business days of
                  payment confirmation.
                </li>
                <li>
                  <strong>Custom builds and repairs</strong> follow our turnaround of{" "}
                  <strong>5–7 business days</strong> from when your parts are checked into the workshop queue.
                </li>
                <li>Turnaround can shift with queue length, diagnostic complexity, or part-availability checks.</li>
                <li>These are estimates, not guarantees — your order timeline updates as each step completes.</li>
              </ul>
            </SupportSection>

            <SupportSection title="Shipping completed orders" id="support-shipping">
              <p>Completed orders are packed and dispatched through Delhivery with your choice of delivery mode at checkout.</p>
              <ul>
                <li>Delivery mode is chosen at checkout from the modes we offer.</li>
                <li>Free shipping applies to product orders flagged free-shipping, or orders that cross the store-wide free-shipping threshold.</li>
              </ul>
              <p>
                For mail-in repairs and builds: the customer covers shipping in <strong>both directions</strong>, and
                return-shipping costs are settled before completed hardware is shipped back.
              </p>
            </SupportSection>

            <SupportSection title="Tracking" id="support-tracking">
              <p>
                Product orders receive a tracking number as soon as they&apos;re dispatched. You can follow every stage
                of an order — workshop progress and shipment — on the{" "}
                <a href="/track-order">Track Order</a> page using your order number. Dispatch emails also include the
                courier&apos;s tracking link.
              </p>
            </SupportSection>

            <SupportSection title="Delivery" id="support-delivery">
              <p>
                Delivery times depend on your location and the mode chosen at checkout — typically around{" "}
                <strong>2 business days</strong> for express and <strong>5 business days</strong> for surface. Remote or
                hard-to-reach pincodes can take a little longer.
              </p>
              <p>
                Once shipped, delivery times are set by the courier and can vary with weather, routes, or local delays.
                KeebForge keeps the Tracking page updated, but isn&apos;t responsible for delays, loss, or damage caused
                by external logistics providers.
              </p>
            </SupportSection>
          </div>
        </div>
      </section>

      <CtaSection title={<>Place Your Order Today</>} desc="Questions about shipping? Ask before you order — replies are fast." />
    </main>
  );
}