import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { SupportSection } from "@/components/support/SupportSection";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Returns & Refunds | KeebForge",
  description:
    "How to request help with a KeebForge order — cancellation, return eligibility, rework and refunds for custom work, repairs, standard products, clearance items, and damaged or incorrect orders.",
  path: "/returns-refunds",
});

export default function ReturnsRefundsPage() {
  return (
    <main>
      <PageHero
        tag="SUPPORT"
        title="Returns & Refunds"
        desc="How to get help with an order — what's covered, what isn't, and how to reach us. This page forms part of the KeebForge Terms & Conditions."
      />

      <section className="svc-section">
        <div className="wrap">
          <div className="support-stack">
            <SupportSection title="At a glance" id="support-summary">
              <p>
                KeebForge sells made-to-order and custom work, repair services,
                and a small number of stocked products. The rules are not the
                same for each.
              </p>
              <ul>
                <li>
                  <strong>Custom, made-to-order and repair work:</strong> no
                  change-of-mind cancellation or return once work has begun.
                  Workmanship issues are handled by rework where covered.
                </li>
                <li>
                  <strong>Standard product orders:</strong> a product return and
                  refund policy has not yet been published. Contact us before
                  ordering if this matters to you.
                </li>
                <li>
                  <strong>Clearance, open-box, used or refurbished items:</strong>{" "}
                  sold in the condition described on the listing. A return and
                  refund policy for these items has not yet been published.
                </li>
                <li>
                  <strong>Damaged, incorrect or defective items:</strong> contact
                  us as soon as possible with photos. We assess these case by
                  case, and your rights under applicable consumer law are not
                  limited.
                </li>
              </ul>
            </SupportSection>

            <SupportSection
              title="Custom work, made-to-order products and repairs"
              id="support-custom"
            >
              <p>
                Most KeebForge work is made for a specific customer. Parts and
                labour are committed once work begins, so custom work,
                made-to-order products and repairs cannot be cancelled or
                returned for a change of mind after work has started.
              </p>
              <p>
                If you want to cancel before work begins, contact us as soon as
                possible. We will tell you whether cancellation is still possible
                and what amount can be refunded. Orders that fail before payment
                are never charged.
              </p>
              <p>
                What we do stand behind is workmanship. If something we did is at
                fault, we will make it right at no extra labour cost where
                covered. Our approach is rework rather than refunds:
              </p>
              <ul>
                <li>
                  Covered: a workmanship defect traceable to our work (for
                  example, a joint we soldered fails, or a switch we lubed
                  sticks).
                </li>
                <li>Covered: damage while the hardware was in our care.</li>
                <li>
                  Covered: an issue on arrival that does not match what was
                  agreed.
                </li>
                <li>
                  Not covered: change of mind, cosmetic variation consistent
                  with the description, normal wear, damage from misuse after we
                  shipped back, or issues outside the agreed scope.
                </li>
              </ul>
              <p>
                Any repair warranty, if offered, is stated in your quote or order
                confirmation. We do not currently publish a standard repair
                warranty period.
              </p>
              <p>
                See <a href="/terms">Terms &amp; Conditions §09</a> for the
                repair and custom-work terms.
              </p>
            </SupportSection>

            <SupportSection title="Standard product orders" id="support-products">
              <p>
                Standard product orders are for stocked, brand-new items. A
                product return and refund policy has not yet been published.
              </p>
              <p>
                If the return or refund position matters to you, contact{" "}
                <a href="mailto:contact@keebforge.in">contact@keebforge.in</a>{" "}
                before placing the order so we can confirm the current position
                for that item.
              </p>
              <p>
                This page does not limit any rights you have under applicable
                consumer law, including rights relating to goods that are
                defective or not as described.
              </p>
            </SupportSection>

            <SupportSection
              title="Clearance, open-box, used and refurbished items"
              id="support-clearance"
            >
              <p>
                Clearance items may be discounted, open-box, used, refurbished,
                display units, or older stock. The condition is shown on the
                product listing. Cosmetic wear consistent with that description
                is not a defect.
              </p>
              <p>
                Any warranty for a clearance item is the warranty stated on its
                listing or provided by the manufacturer. We do not currently
                publish a separate return or refund policy for clearance items;
                contact us before ordering if you need certainty.
              </p>
              <p>
                If a clearance item is defective or materially different from its
                description, contact us. We will assess it case by case, and
                your statutory rights are not limited.
              </p>
            </SupportSection>

            <SupportSection
              title="Damaged, incorrect or defective items"
              id="support-damaged"
            >
              <p>
                If an order arrives damaged, is materially different from what
                you ordered, or appears defective, contact us as soon as
                possible — ideally within 48 hours of delivery. Waiting longer
                can make it harder to investigate, but it does not remove rights
                you have under applicable law.
              </p>
              <p>
                Please keep the item, packaging, and any inserts, and send clear
                photos or a short video showing the issue. Do not attempt a
                repair yourself before we have assessed it, as that may affect
                what we can do.
              </p>
              <p>
                We assess damaged, incorrect, and defective items case by case.
                Depending on the item and the cause, the available options may
                include replacement parts, rework, a replacement, or a refund.
                We will explain the options once we have the details. Nothing in
                this section limits remedies available under applicable consumer
                law.
              </p>
            </SupportSection>

            <SupportSection title="Cancellations" id="support-cancellations">
              <p>
                There is no self-service cancellation button. Contact us with
                your order number as soon as possible. Cancellation is not
                automatic and depends on whether work has begun, parts have been
                ordered, or the order has been dispatched.
              </p>
              <ul>
                <li>
                  <strong>Quote requests:</strong> no payment is taken when you
                  submit a quote request, so there is nothing to refund if you
                  decide not to proceed.
                </li>
                <li>
                  <strong>Paid custom or repair work:</strong> cannot be
                  cancelled for change of mind once work has begun.
                </li>
                <li>
                  <strong>Product orders:</strong> contact us before dispatch.
                  If we can stop the order, we will explain what can be refunded.
                </li>
              </ul>
              <p>
                If we cancel an order because we cannot fulfil it, we will refund
                the amount paid for the unfulfilled part, subject to applicable
                law.
              </p>
            </SupportSection>

            <SupportSection title="Refunds" id="support-refunds">
              <p>
                <strong>Custom work, made-to-order products and repairs:</strong>{" "}
                these are generally resolved by rework rather than a refund.
                Workmanship issues covered by the policy above are corrected at
                no extra labour cost.
              </p>
              <p>
                <strong>Product orders:</strong> a product refund policy has not
                yet been published. If a refund is approved, it is sent back to
                the original payment method through Razorpay. We do not make cash
                refunds.
              </p>
              <p>
                Refund timing is set by Razorpay, the card network, and your bank.
                Once a refund is initiated, it can take additional time to appear
                on your statement. We will share the refund reference once it is
                available.
              </p>
              <p>
                This page does not limit any refund or other remedy available
                under applicable consumer law.
              </p>
            </SupportSection>

            <SupportSection
              title="How to request a return or report an issue"
              id="support-how-to"
            >
              <ul>
                <li>
                  Contact KeebForge as soon as possible after delivery — ideally
                  within 48 hours.
                </li>
                <li>
                  Include your order number and a clear description of the issue.
                </li>
                <li>
                  Share clear photos or a short video showing the item,
                  packaging, and the problem.
                </li>
                <li>
                  Keep the item unused beyond normal testing until we confirm
                  next steps.
                </li>
                <li>
                  Do not send anything back until we have confirmed the return
                  address and who is responsible for return shipping.
                </li>
                <li>
                  Use the <a href="/contact">contact page</a> or email{" "}
                  <a href="mailto:contact@keebforge.in">contact@keebforge.in</a>.
                </li>
              </ul>
            </SupportSection>

            <SupportSection title="Policy source" id="support-source">
              <p>
                The cancellation, workmanship, rework and refund rules above are
                part of the <a href="/terms">Terms &amp; Conditions</a>. The
                product-order return and refund policy is not yet published;
                where this page says a policy is not published, that is the
                current position, not an implied promise.
              </p>
              <p>
                Last updated: 29 October 2026.
              </p>
            </SupportSection>
          </div>
        </div>
      </section>

      <CtaSection
        title={<>Need Help With an Order?</>}
        desc="Reach out and we'll review the issue — replies are fast."
        primaryLabel="Contact Us"
        primaryHref="/contact"
      />
    </main>
  );
}
