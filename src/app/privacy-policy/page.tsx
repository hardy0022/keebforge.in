import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { SectionHead } from "@/components/ui/SectionHead";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Privacy Policy | KeebForge",
  description:
    "How KeebForge.in collects, uses, and protects your personal data — account details, order information, and payment handling through Razorpay.",
  path: "/privacy-policy",
});

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "01 — What We Collect",
    body: [
      "When you place an order or request a service, we collect the contact and shipping details you provide: your name, email address, phone number, and delivery/billing addresses.",
      "If you create an account, we store your login email and the profile/address information you add. We do not collect or store anything beyond what is needed to run your orders.",
    ],
  },
  {
    title: "02 — How Payments Are Handled",
    body: [
      "Payments are processed by Razorpay. Your card, UPI, or banking credentials go directly to Razorpay's secure checkout — KeebForge never sees or stores them.",
      "We retain only the payment confirmation (amount, payment ID, and status) needed to reconcile your order.",
    ],
  },
  {
    title: "03 — How Your Data Is Used",
    body: [
      "Your details are used to confirm quotes, book parts, ship completed work back to you, and support you after delivery. We may reach out on the phone number or email you provided about your order.",
      "We do not sell or rent your personal data. It is shared only with the logistics partners moving your package and with our payment processor, strictly to fulfill your order.",
    ],
  },
  {
    title: "04 — Retention & Your Choices",
    body: [
      "Order records are kept so warranty/rework claims under our terms can be honored. You can update or remove saved addresses from your account page at any time.",
      "To access, correct, or delete your account data, email us and we will take care of it.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main>
      <PageHero
        tag="Privacy Policy"
        title="Privacy Policy"
        desc="Last updated: August 2026. This policy covers how KeebForge.in handles the personal data you share when placing orders or requesting services."
      />
      <section className="svc-section" aria-labelledby="t-privacy">
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
            <SectionHead title="Questions About Your Data?" desc="Reach out any time — email replies are fast." />
            <a href="mailto:contact@keebforge.in" className="btn-prime">
              Email Us: contact@keebforge.in
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
