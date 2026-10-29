import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { SectionHead } from "@/components/ui/SectionHead";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Privacy Policy | KeebForge",
  description:
    "How KeebForge.in collects, uses, stores, and shares personal data — accounts, orders, payments, shipping, repairs, uploads, email, analytics, cookies, retention, and account deletion.",
  path: "/privacy-policy",
});

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "01 — Who We Are",
    body: [
      "KeebForge.in (\"KeebForge\", \"we\", \"our\", \"us\") is an independent electronics workshop based in Jammu & Kashmir, India. We provide custom mechanical keyboard builds, modifications, repairs, and related services through keebforge.in.",
      "This Privacy Policy explains what personal data we collect, why we collect it, how we use and share it, how long we keep it, and the choices and rights available to you.",
      "For privacy questions or requests, email contact@keebforge.in.",
    ],
  },
  {
    title: "02 — Scope",
    body: [
      "This policy applies to keebforge.in, our checkout, order tracking, and communications we send in connection with our services. It does not govern third-party websites or services you reach through links on our site — their own privacy policies apply to them.",
    ],
  },
  {
    title: "03 — What We Collect",
    body: [
      "Account and sign-in data: your name, email address, and authentication records. If you create an account, we also store password credentials in hashed form through our authentication system. If you sign in with Google or Discord, we receive identifiers and profile information those providers share as permitted by your settings.",
      "Profile data: optional details you add, such as phone number, username, and avatar.",
      "Order and checkout data: your name, email address, phone number, billing and shipping addresses, order items and services, notes, and order/tracking identifiers. Guest checkout is supported.",
      "Payment data: Razorpay order, payment, and refund identifiers, amounts, currency, status, and records needed for reconciliation and support. We do not receive or store full card, UPI, or bank credentials.",
      "Repairs, custom work, and contact data: device details, issue descriptions, notes, contact details, and any information you submit through repair, mod, review, or contact forms.",
      "Uploaded images: photos you attach to repair requests, mod inquiries, reviews, or the contact form. Images are hosted by Cloudinary.",
      "Review content: your rating, review title and text, the display name you use, any photos you attach, and the product or service context. Published reviews and their photos may be displayed publicly on the site.",
      "Communications: transactional email records (such as order and repair notifications), delivery status, and the content of messages you send to us.",
      "Newsletter preference: whether you have opted in to updates, stored on your customer profile.",
      "Technical, security, and session data: IP address, browser user-agent, session records, and server logs used to operate and secure the site.",
      "Analytics and usage data: page URLs, referrers, approximate device/browser information, and performance measurements collected by the analytics services described below.",
      "Browser storage: the mods/custom-work checkout may keep a temporary draft, including contact details you entered, in your browser's session storage. It is not sent to us until you submit it, and it can be cleared by closing the tab or clearing site data.",
    ],
  },
  {
    title: "04 — How We Use Your Data",
    body: [
      "To provide our services: process orders, quotes, repairs, custom work, shipping, and customer support.",
      "To communicate: send transactional messages such as order confirmations, payment and repair updates, verification and password-reset emails, and replies to your inquiries.",
      "To authenticate and secure the site: manage accounts and sessions, prevent fraud and abuse, apply rate limits, and enforce our Terms.",
      "To maintain business records: warranty and rework history, accounting, tax, and legal or dispute-related records.",
      "To improve the site: understand aggregate usage and performance through analytics.",
      "To publish reviews you choose to submit and operate the review feature, including moderation.",
      "Marketing (optional): if you opt in to newsletter updates, we may send relevant updates. You can change this preference in Settings.",
      "To comply with law and enforce our rights.",
    ],
  },
  {
    title: "05 — Accounts & Authentication",
    body: [
      "Accounts are optional; eligible orders can be placed as a guest. Authentication is handled by Better Auth. Passwords are stored in hashed form by the authentication system — we do not store plain-text passwords.",
      "We store session records, including IP address and browser user-agent, for security and account management. Sessions expire under our authentication configuration.",
      "Google and Discord sign-in are optional. If you use them, the provider authenticates you and shares identifiers and profile information permitted by your settings. We store the linked account identifiers needed to sign you in.",
    ],
  },
  {
    title: "06 — Orders, Payments & Shipping",
    body: [
      "Orders can be placed as a guest or while signed in. For guest orders, we may set an HttpOnly payment-capability cookie in your browser and store only a hash of that token with the order so the order can be paid securely later.",
      "Payments are processed by Razorpay. We do not receive or store full card, UPI, or bank credentials. We retain payment and refund identifiers, amounts, status, and related records for reconciliation, support, and accounting.",
      "Physical orders and mail-in services use Delhivery for shipping quotes, labels, pickup, and tracking. We share the name, phone number, address, and order or shipment details needed for those purposes.",
      "Our public order-tracking page reads a separate tracking cache and realtime updates. It shows the order number, status, items or services, and service updates, but does not display your name, email, phone number, or address.",
    ],
  },
  {
    title: "07 — Repairs, Custom Work & Uploaded Images",
    body: [
      "Repair and custom-work requests are saved as orders and include the details you submit, such as device information, the issue description, notes, and your service and shipping preferences.",
      "Photos you upload are hosted by Cloudinary. Repair photos are linked to the order and are visible to authorised staff for diagnosis and service. Review photos are linked to the review and may be publicly displayed if the review is published. Contact-form photos are hosted on Cloudinary and referenced in the email we receive.",
      "We do not currently run automatic deletion of uploaded images. Deleting your account does not delete images already uploaded to Cloudinary or their references.",
    ],
  },
  {
    title: "08 — Communications & Marketing",
    body: [
      "We use Resend to deliver transactional email, including password resets, email verification, order and repair notifications, and contact-form delivery. Our application stores order-notification records and their delivery status.",
      "Your newsletter preference is stored on your customer profile and can be changed in Settings at any time. Withdrawing newsletter consent does not delete your account and does not stop transactional messages related to orders or services. We do not currently operate an automated marketing-campaign system inside the application.",
    ],
  },
  {
    title: "09 — Analytics, Cookies & Similar Technologies",
    body: [
      "Essential cookies: we use cookies and similar technologies required for authentication (Better Auth session), the shopping cart (kf_cart), and the guest payment capability (HttpOnly). These are necessary for sign-in, cart, and secure payment.",
      "Analytics: Umami Cloud, Vercel Analytics, and Vercel Speed Insights are loaded automatically on site pages. Google Tag Manager is loaded only when we configure it through NEXT_PUBLIC_GTM_ID. These services may collect page URLs, referrers, approximate device/browser information, and performance data. We sanitise URLs for the integrations that support it so that query strings and fragments — which can contain payment tokens — are not sent.",
      "We do not currently provide an in-site cookie or analytics consent banner, and there is no in-site analytics opt-out. You can block or clear cookies and scripts through your browser settings or extensions. Blocking essential cookies may prevent sign-in, cart, or payment from working.",
    ],
  },
  {
    title: "10 — Third-Party Service Providers",
    body: [
      "We share personal data with service providers that help us operate the site and fulfil orders. We do not sell or rent personal data. The providers currently used are:",
      "Supabase — managed PostgreSQL database (and realtime tracking updates). Stores account, profile, order, payment, and related records.",
      "Vercel — hosting and deployment, plus Vercel Analytics and Speed Insights.",
      "Razorpay — payment processing. Receives the payment and order details needed to process a payment.",
      "Resend — email delivery. Receives recipient addresses and message content, including contact-form submissions.",
      "Delhivery — shipping quotes, labels, pickup, and tracking. Receives name, phone, address, and shipment details.",
      "Cloudinary — image hosting. Receives uploaded images.",
      "Umami Cloud — analytics. Receives page and usage telemetry.",
      "Google Tag Manager — only if configured by us. May load tags configured in our container.",
      "Google and Discord — only if you choose OAuth sign-in. They authenticate you and exchange account information under their own policies.",
      "Some providers operate globally and may process data outside India. We do not currently publish specific cross-border transfer safeguards; our approach to cross-border transfers is under review.",
      "We may also disclose data where required by law, to enforce our Terms, or to protect rights, safety, and security.",
    ],
  },
  {
    title: "11 — Data Retention",
    body: [
      "Accounts and profile data are kept until you delete your account or ask us to delete them. Sessions expire under our authentication configuration.",
      "Orders, order address snapshots, payments, refunds, repairs, warranty records, order messages and timeline entries, and related records are retained in our database. We do not currently apply an automatic deletion schedule. These records may be needed for fulfilment, warranty and rework, accounting, tax, and dispute handling. The specific retention period is a policy and legal decision that has not yet been finalised.",
      "Reviews and their photos may be retained after the linked account is deleted. The profile link is removed, but the author name you provided may remain and a published review may stay visible. You can contact us to request that a review or photo be reviewed for removal.",
      "Uploaded images are retained on Cloudinary and, where applicable, linked to orders or reviews until manually removed. We do not currently run automatic image deletion.",
      "Contact-form inquiries are not stored in our application database. The email and any Cloudinary-hosted photos remain in our inbox and provider systems until deleted.",
      "Analytics and server logs are retained according to the relevant provider or platform settings.",
    ],
  },
  {
    title: "12 — Account Deletion & Erasure",
    body: [
      "You can delete your account in Settings > Danger Zone. If you sign in with a password, you must confirm it. If you sign in only through Google or Discord, a recent session may be required.",
      "What is deleted: your user record, profile, linked credential and OAuth account records, sessions, saved addresses, cart, and customer preferences.",
      "What is not deleted: orders, order address snapshots, order items, services and repairs, payments, refunds, order timeline and messages, notifications, warranty records, and order tracking records. These are retained and become unlinked from your account — the profile link is removed — but they still contain the name, email address, phone number, and address details captured with the order. Reviews may also remain: the profile link is removed, but the author name you provided may remain, and a published review may stay visible. Uploaded images, including Cloudinary files and their stored references, are not automatically deleted. Contact-form emails and photos are not affected by account deletion. Short-lived verification token records may remain until they expire or are cleaned up.",
      "You can email contact@keebforge.in to request deletion of specific remaining records. We may be unable to delete records we need for legal, accounting, warranty, or dispute purposes; we will explain what can be removed.",
    ],
  },
  {
    title: "13 — Your Rights",
    body: [
      "Subject to applicable law, including the Digital Personal Data Protection Act, 2023 and applicable rules, you may have rights to access, correct, erase, withdraw consent, seek grievance redressal, and nominate. The mechanisms currently available are:",
      "Access: you can view your profile, addresses, orders, and reviews in your account, or email us to request a copy of your data. There is no automated self-serve data-export tool.",
      "Correction: you can update your profile and saved addresses in your account. Order records are historical snapshots and are not editable retroactively; email us if an order record needs correction.",
      "Erasure: you can delete your account (see section 12) or email us to request deletion of specific records. Some transactional records may be retained as described above.",
      "Consent withdrawal: you can change your newsletter preference in Settings. Analytics currently load automatically and there is no in-site analytics opt-out; browser controls are available. Orders and services are processed to perform our contract with you, not solely on consent.",
      "Nomination: there is no dedicated nomination feature at present. Email contact@keebforge.in if you want to nominate someone to exercise your rights; we will explain what we can currently accept and what verification we need. Formal nomination handling is under legal review.",
      "Grievance: email contact@keebforge.in. We have not currently designated a separate Data Protection Officer or Grievance Officer; whether a formal designation is required is under legal review. You may also have the right to complain to the Data Protection Board of India under the DPDP Act.",
      "Some rights may be limited by legal obligations or by the rights of others.",
    ],
  },
  {
    title: "14 — Security",
    body: [
      "We use reasonable technical and organisational safeguards appropriate to the data we process, including access controls, input validation, authentication, payment signature verification, rate limiting, and encrypted transport (HTTPS) in production. No method of storage or transmission is completely secure, and we cannot guarantee absolute security.",
      "If we become aware of a security incident affecting your personal data, we will assess and respond as required by applicable law.",
    ],
  },
  {
    title: "15 — Children's Data",
    body: [
      "Our services are not directed to children. Under the DPDP Act, a child is an individual who has not completed 18 years of age. We do not knowingly collect personal data from children, and we do not currently operate age-verification or verifiable-parental-consent mechanisms.",
      "If you believe a child has provided personal data to us, contact contact@keebforge.in and we will take appropriate action. If our services are ever offered to children, additional consent and processing controls would be required and this policy would be updated.",
    ],
  },
  {
    title: "16 — Changes to This Policy",
    body: [
      "We may update this Privacy Policy from time to time. The \"Last updated\" date will change, and the current version will always be available on this page. Where changes are material, we will take reasonable steps to bring them to your attention. Continued use of our services after an update means the updated policy applies.",
    ],
  },
  {
    title: "17 — Contact & Grievances",
    body: [
      "Email contact@keebforge.in for privacy questions, data requests, or grievances. Include \"Privacy request\" in the subject and enough detail for us to identify your account or orders. We aim to respond within a reasonable period.",
      "This policy describes our current practices. It does not by itself certify compliance with any specific law.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main>
      <PageHero
        tag="Privacy Policy"
        title="Privacy Policy"
        desc="Last updated: 29 October 2026. How KeebForge.in collects, uses, and protects your personal data."
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
            <SectionHead
              title="Questions About Your Data?"
              desc="Reach out any time — email replies are fast."
            />
            <a href="mailto:contact@keebforge.in" className="btn-prime">
              Email Us: contact@keebforge.in
            </a>
            <p className="mt-4 text-sm opacity-80">
              See also our <a href="/terms">Terms &amp; Conditions</a> and{" "}
              <a href="/faq">FAQ</a>.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
