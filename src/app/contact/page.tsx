import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { SectionHead } from "@/components/ui/SectionHead";
import { Checklist } from "@/components/ui/Checklist";
import { CtaSection } from "@/components/ui/CtaSection";
import { InquiryForm } from "@/components/contact/InquiryForm";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Contact KeebForge — Repair Inquiries | KeebForge",
  description:
    "Questions about a repair, a quote for PCB work, or a custom build in mind? Contact KeebForge — a mail-in keyboard and mouse repair service available across India.",
  path: "/contact",
});

const CHANNELS = [
  { icon: "🛒", title: "Order Page", desc: "The fastest path — select services, get an estimate, and start your order.", href: "/shop/checkout", label: "Place an Order" },
  { icon: "💬", title: "Discord", desc: "Questions, quotes and order confirmations. Reach Hardy on Discord.", href: "https://discord.com/users/843113968734437376", label: "Chat on Discord" },
  { icon: "✉️", title: "Email", desc: "Repair inquiries can be sent to contact@keebforge.in via the form below.", href: "mailto:contact@keebforge.in", label: "contact@keebforge.in" },
];

const BEFORE_SHIPPING = [
  "Place an order on the order page and select the services you need.",
  "Confirm the details and any quote on Discord or email.",
  "Pack the keyboard, mouse or parts carefully and ship to Jammu & Kashmir.",
  "Share the tracking details so KeebForge can expect the shipment.",
];

export default function ContactPage() {
  return (
    <main>
      <PageHero
        tag="Contact"
        title="Contact KeebForge"
        desc="Questions about a repair, a quote for PCB work, or a custom build in mind? Here's how to reach KeebForge — a mail-in keyboard and mouse repair service available across India."
        pills={["Mail-in service across India", "Order online or ask on Discord", "Fast replies"]}
      />

      <section className="svc-section" aria-labelledby="t-channels">
        <div className="wrap">
          <SectionHead num="01 // Reach" title="How to Reach KeebForge" />
          <div className="cards-wide">
            {CHANNELS.map((c) => (
              <a key={c.title} href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener" className="card card-q">
                <div className="ch">
                  <span className="ci" aria-hidden="true">{c.icon}</span>
                </div>
                <h3 className="ct">{c.title}</h3>
                <p className="cd">{c.desc}</p>
                <p className="cd" style={{ color: "var(--acc)", marginTop: 12 }}>{c.label}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="svc-section" aria-labelledby="t-mailin">
        <div className="wrap">
          <SectionHead num="02 // Mail-in" title="Mail-in Service Across India" />
          <div className="card max-w-[760px]">
            <p className="cd">
              KeebForge is a <strong style={{ color: "var(--t1)" }}>mail-in service based in Jammu &amp; Kashmir</strong> — there is
              no physical walk-in shop. Keyboards, mice and parts are shipped to us, serviced, and shipped back.{" "}
              <strong style={{ color: "var(--t1)" }}>Keyboard and mouse repair services are available across India.</strong>{" "}
              The buyer covers shipping in both directions. Payment is confirmed before work begins — this books any
              parts needed and secures the order — and optional work samples can be shared as work progresses.
            </p>
          </div>
        </div>
      </section>

      <Checklist items={BEFORE_SHIPPING} title="What to Do Before Shipping" />

      <section className="svc-section" aria-labelledby="t-form">
        <div className="wrap">
          <SectionHead num="03 // Inquiry" title="Send a Repair Inquiry" />
          <div className="max-w-[560px]">
            <InquiryForm />
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
        desc="Ordering directly is the fastest path — the contact form is best for questions and quotes."
      />
    </main>
  );
}