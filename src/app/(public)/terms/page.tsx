import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { SectionHead } from "@/components/ui/SectionHead";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Terms & Conditions | KeebForge",
  description:
    "Terms for custom keyboard builds, switch modifications, repairs, orders, payments, shipping, and use of KeebForge.in.",
  path: "/terms",
});

type Section = {
  title: string;
  body: Array<string | { type: "ul"; items: string[] }>;
};

const SECTIONS: Section[] = [
  {
    title: "01 — Acceptance of Terms",
    body: [
      "By accessing or using KeebForge.in and submitting an order or service request, you agree to be bound by these Terms & Conditions. If you do not agree, please do not use our services.",
      "Last updated: 29 October 2026.",
    ],
  },
  {
    title: "02 — Services",
    body: [
      "KeebForge offers mechanical keyboard and gaming mouse services including switch lubing/filming, spring swaps, stabilizer tuning, soldering/desoldering, hot-swap socket repair, Mill-Max installation, PCB troubleshooting/repair, custom keyboard builds, firmware work, and mouse repairs (switches, encoders, skates, diagnostics). Services are primarily mail-in across India.",
      "Service availability, parts, and listed prices can change. Some work is quoted only after inspection. We may decline work that is unsafe, unsupported, unlawful, or impractical to complete.",
    ],
  },
  {
    title: "03 — Accounts & Eligibility",
    body: [
      "You may browse and order as a guest or create an account. You must be legally capable of entering into a binding contract. If you are under 18, you may use the services only with the involvement and agreement of a parent or legal guardian.",
      "You are responsible for providing accurate, current information, keeping your sign-in credentials confidential, and all activity under your account to the extent permitted by law. Tell us promptly if you believe your account has been accessed without authorisation.",
      "We may suspend or close an account, or refuse an order, where we reasonably believe there is fraud, abuse, misuse, a legal requirement, or a risk to customers, staff, or the service.",
    ],
  },
  {
    title: "04 — Orders, Quotes & Acceptance",
    body: [
      "Placing an order or service request is an offer to buy. An automated acknowledgement, order-received page, or payment authorisation is not by itself our acceptance. We accept an order when we confirm it, capture payment, or begin work, whichever happens first.",
      "Some work is quoted after inspection. Fixed-price services are billed at listed rates; other work requires a quote confirmed by you before work begins. You are responsible for checking the configuration, options, quantities, contact details, and delivery address before paying.",
      "We may decline or cancel an order where, for example, parts are unavailable, the work is unsafe or unsupported, a listing or pricing error has occurred, fraud is suspected, delivery is not possible, or we cannot reasonably fulfil the order. If we cancel before fulfilment, we will refund the amount paid for the unfulfilled part of the order, subject to applicable law.",
      "Made-to-order and custom products are built after the order is accepted. Lead times are estimates and may change with parts availability, queue length, or the scope of work.",
    ],
  },
  {
    title: "05 — Products, Descriptions & Availability",
    body: [
      "We aim to describe products accurately, but descriptions, specifications, measurements, and images are indicative. Colours can vary between displays, and custom, hand-finished, or made-to-order items may have minor cosmetic variation. Minor variation that does not affect function and does not differ materially from the description is not a defect.",
      "Clearance, open-box, used, refurbished, and display items are sold in the condition described on the listing. Cosmetic wear consistent with that description is not a defect. Any warranty for such an item is the warranty stated on its listing or provided by the manufacturer.",
      "Stock availability is not guaranteed until an order is accepted. Made-to-order products may be built only after you order. If an item becomes unavailable after payment, we will contact you and either offer an alternative or cancel and refund the unfulfilled part of the order.",
      "Shipping information and warranty information shown on a product listing form part of the description for that product. Nothing in this section excludes remedies available under applicable consumer law for goods that are defective or not as described.",
    ],
  },
  {
    title: "06 — Pricing, Payment & Parts",
    body: [
      "Prices are in INR. The total payable, including any delivery charge shown at checkout, is displayed before you pay. Prices and availability may change before an order is accepted.",
      "If a listing, price, discount, or calculation error is discovered before we fulfil an order, we may cancel the affected order and refund the amount paid, or contact you to confirm a corrected price. We will not charge a higher price without your agreement.",
      "Payments are processed by Razorpay. We do not store your full card, UPI, or bank credentials. Payment must be completed before work begins unless we have agreed otherwise in writing (for example, for a quote request that is paid after inspection).",
      "A failed, cancelled, or abandoned payment does not create a charge from KeebForge. If a payment is deducted but not confirmed, contact us with the payment reference so we can reconcile it.",
      "For switch work you may provide your own switches, films, or other parts, or ask us to source them. We cannot guarantee the condition, compatibility, or performance of customer-supplied parts, and any warranty on those parts remains with you or their supplier. Parts sourced by us are subject to availability.",
      "Coupons and discounts are subject to their stated conditions, expiry, and availability. Misuse, duplicate accounts, or attempts to circumvent limits may result in cancellation of the affected order.",
    ],
  },
  {
    title: "07 — Shipping, Delivery & Mail-in",
    body: [
      "KeebForge is a mail-in service (no physical walk-in shop). You are responsible for safely packing and shipping your device to the address provided. Unless we agree otherwise, you cover shipping in both directions.",
      "You bear the risk of loss or damage while your device is in transit to us. We recommend using a tracked and, where available, insured courier and keeping the receipt and tracking details. We will reasonably assist with a courier claim, but we are not the carrier.",
      "Shipping is facilitated via partners such as Delhivery where applicable. Delivery and turnaround timelines are estimates, not guarantees. Delays can occur due to courier operations, weather, routes, local restrictions, parts availability, or events outside our reasonable control.",
      "You are responsible for providing an accurate delivery address, PIN code, phone number, and any delivery instructions. If delivery fails because details are incorrect, incomplete, or nobody is available to receive the item, we will contact you to arrange re-delivery or return. Additional shipping charges may apply; we will explain any charge before you incur it.",
      "To the extent permitted by applicable law, we are not responsible for delays, loss, or damage caused by an external logistics provider. This does not exclude any rights you have against the courier or under applicable consumer law, and we will reasonably assist you in raising a claim.",
      "We are not liable for delay or failure caused by events beyond our reasonable control, including natural events, strikes, transport disruption, government action, supplier failure, or widespread network or power outages.",
    ],
  },
  {
    title: "08 — Cancellations, Returns & Refunds",
    body: [
      {
        type: "ul",
        items: [
          "Custom work and repairs cannot be cancelled or returned for change of mind once work has begun, because parts and labour are already committed.",
          "If you want to cancel before work begins, contact us as soon as possible. We will tell you whether cancellation is possible and what amount can be refunded. Orders that fail before payment are never charged.",
          "For product orders, a product return and refund policy has not yet been published. Please read our Returns & Refunds page and contact us before ordering if the return or refund position matters to you. Nothing in this section limits rights available under applicable consumer law.",
          "Workmanship defects traceable to our work will be corrected by rework at no extra labour cost where covered.",
          "Damage while the hardware was in our care, or an issue on arrival that does not match what was agreed, will be assessed case by case.",
          "Normal wear, cosmetic variation consistent with the description, misuse after return, damage caused by the customer or a third party, or issues outside the agreed scope are not covered.",
          "If a refund is approved, it is sent back to the original payment method through Razorpay. We do not make cash refunds. The time for the money to appear is set by Razorpay, the card network, and your bank, and can take longer than the refund initiation.",
          "Custom and repair orders are generally resolved by rework rather than a refund.",
        ],
      },
      "Our Returns & Refunds page describes the current return, rework, damaged-item, and refund approach in more detail and forms part of these Terms.",
    ],
  },
  {
    title: "09 — Repairs & Custom Work",
    body: [
      "You are responsible for giving accurate device details, model/PCB information, fault history, and any relevant modifications or prior repairs. Hidden damage, previous work, liquid damage, or faults that were not disclosed can affect whether a repair is possible and how long it takes.",
      "Diagnosis can be uncertain. A fault may not be reproducible, may have more than one cause, or may only become apparent after work begins. If we find additional faults or the scope changes, we will contact you with a revised quote. We will not carry out additional chargeable work without your approval.",
      "Repairs and custom work may reset or change firmware, profiles, onboard settings, or paired-device information. Back up anything you need before sending the device. We do not guarantee preservation of firmware settings, profiles, or data stored on the device.",
      "We may decline or stop work if a device is unsafe, has been badly damaged by a previous repair, is not economically repairable, or requires parts we cannot reasonably obtain. If we stop work, we will explain why and discuss the available options, including return of the device.",
      "Turnaround times are estimates. Any repair warranty, if offered, will be stated in your quote or order confirmation. We do not currently publish a standard repair-warranty period. Warranty does not cover new damage, misuse, liquid damage, normal wear, or work outside the original scope.",
      "Customer-supplied parts are used at your risk. We cannot guarantee their condition, compatibility, or performance, and any warranty on them remains with you or their supplier.",
    ],
  },
  {
    title: "10 — Customer Information, Uploads & Reviews",
    body: [
      "You are responsible for the accuracy of information you provide. Diagnostic photos you upload are used to assess and service your request and may be stored via Cloudinary for that purpose.",
      "If you submit a review, you confirm that the content is yours or that you have permission to submit it, and that it is not unlawful, defamatory, misleading, infringing, or in breach of another person's privacy. Reviews may be moderated, and we may decline or remove content that breaches these Terms or applicable law.",
      "Published reviews and any photos you choose to attach may be displayed publicly on the site. You retain ownership of your review content. By submitting it, you grant KeebForge a non-exclusive, royalty-free licence to store, reproduce, display, and moderate that content on the site and in connection with operating the review feature. We do not claim ownership of your review content.",
      "Reviews may remain after you delete your account. The link to your profile is removed, but the display name you provided may remain and a published review may stay visible. Contact us if you want a review or photo reviewed for removal.",
    ],
  },
  {
    title: "11 — Intellectual Property",
    body: [
      "Content on KeebForge.in (text, images, design) belongs to KeebForge unless credited otherwise. Do not reuse it commercially without permission. Open-source projects remain under their respective licenses.",
      "Customer review content remains owned by the customer, subject to the licence described above.",
    ],
  },
  {
    title: "12 — Prohibited Use",
    body: [
      "You agree not to misuse the site, interfere with security features, submit false information or fake reviews, scrape or automate access in a way that harms the service, upload malicious code, harass staff or other customers, or use the services for unlawful purposes.",
    ],
  },
  {
    title: "13 — Warranties & Liability",
    body: [
      "We will provide services with reasonable care and skill. Products are supplied subject to the description, any warranty stated on the listing, and any manufacturer warranty. Modification and repair work may void the manufacturer's warranty on the affected components.",
      "To the maximum extent permitted by applicable law, KeebForge disclaims implied warranties and is not liable for indirect or consequential loss, loss of profit, loss of business, or loss of data. Our aggregate liability for a specific order or service is limited to the amount you paid for that order or service.",
      "Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited, including liability for fraud, death or personal injury caused by negligence, or rights available to consumers under applicable law. If you are a consumer, you may have remedies that are broader than the limitations in this section.",
      "We are not responsible for customer-supplied parts, pre-existing device faults, damage caused by misuse or a third party after return, or failures caused by events outside our reasonable control.",
    ],
  },
  {
    title: "14 — Privacy",
    body: [
      "Your use of our services is also governed by our Privacy Policy. It explains what data we collect, how we use and share it, how long we keep it, and the choices available to you. Please review it before using the services.",
    ],
  },
  {
    title: "15 — Governing Law & Disputes",
    body: [
      "These Terms are governed by the laws of India. Subject to applicable consumer law, disputes are subject to the jurisdiction of the courts of Jammu & Kashmir, India.",
      "Nothing in this clause limits any mandatory right you may have to bring a consumer complaint or proceeding in a forum permitted by law.",
    ],
  },
  {
    title: "16 — Changes to Terms",
    body: [
      "We may update these Terms from time to time. The updated version will be posted on this page with a new date. Where changes are material, we will take reasonable steps to bring them to your attention. Continued use after an update means the updated Terms apply to the extent permitted by law.",
    ],
  },
  {
    title: "17 — Contact, Grievances & General",
    body: [
      "For questions about these Terms, an order, or a grievance, email contact@keebforge.in with enough detail to identify the order or account. See also our Privacy Policy and Returns & Refunds page.",
      "If any provision of these Terms is found unenforceable, the remaining provisions will continue to apply. Our failure to enforce a provision is not a waiver of it. These Terms, together with the Privacy Policy and Returns & Refunds page, describe the basis on which we provide the site and services.",
    ],
  },
];

export default function TermsPage() {
  return (
    <main>
      <PageHero
        tag="Terms & Conditions"
        title="Terms & Conditions"
        desc="Terms covering custom keyboard builds, modifications, repairs, orders, payments, shipping, and use of KeebForge.in."
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
                  {s.body.map((block, i) => {
                    if (typeof block === "string") {
                      return (
                        <p key={i} className={i > 0 ? "mt-3" : undefined}>
                          {block}
                        </p>
                      );
                    }
                    if (block.type === "ul") {
                      return (
                        <ul key={i} className="mt-2 list-disc pl-5 space-y-2">
                          {block.items.map((item, j) => (
                            <li key={j}>{item}</li>
                          ))}
                        </ul>
                      );
                    }
                    return null;
                  })}
                </div>
              </details>
            ))}
          </div>

          <div className="mt-10">
            <SectionHead
              title="Questions About These Terms?"
              desc="Reach out any time — email replies are fast."
            />
            <a href="mailto:contact@keebforge.in" className="btn-prime">
              Email Us: contact@keebforge.in
            </a>
            <p className="mt-4 text-sm opacity-80">
              See also our <a href="/privacy-policy">Privacy Policy</a>,{" "}
              <a href="/returns-refunds">Returns &amp; Refunds</a>, and{" "}
              <a href="/faq">FAQ</a>.
            </p>
          </div>
        </div>
      </section>

      <CtaSection title={<>Place Your Order Today</>} />
    </main>
  );
}
