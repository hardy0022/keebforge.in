import type { Metadata } from "next";
import { SectionHead } from "@/components/ui/SectionHead";
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
  { icon: "💬", title: "Discord", desc: "Questions, quotes and order confirmations. Reach Hardy on Discord.", href: "https://discord.com/users/843113968734437376", label: "Chat on Discord" },
  { icon: "✉️", title: "Email", desc: "Repair inquiries can be sent to contact@keebforge.in via the form below.", href: "mailto:contact@keebforge.in", label: "contact@keebforge.in" },
];

const GUARANTEES = [
  "Describe the issue clearly",
  "Add photos if possible",
  "We'll review it and get back with a quote",
];

export default function ContactPage() {
  return (
    <main className="contact-page">
      <section className="contact-hero" aria-labelledby="contact-title">
        <div className="wrap contact-hero-grid">
          <div className="contact-hero-copy">
            <span className="sec-num">{"// Contact"}</span>
            <h1 className="sec-title" id="contact-title">
              Contact KeebForge
            </h1>
          </div>
        </div>
      </section>

      <section className="contact-inquiry" aria-labelledby="t-form">
        <div className="wrap contact-inquiry-grid">
          <div className="contact-inquiry-info">
            <SectionHead
              title="Send a Repair Inquiry"
              desc="Describe your device and issue — we&apos;ll get back to you with a quote."
            />
            <div className="contact-channels">
              {CHANNELS.map((c) => (
                <a key={c.title} href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener" className="contact-channel">
                  <div className="contact-channel-top">
                    <span className="ci" aria-hidden="true">{c.icon}</span>
                    <h3 className="ct">{c.title}</h3>
                  </div>
                  <p className="cd">{c.desc}</p>
                  <p className="contact-channel-link">{c.label}</p>
                </a>
              ))}
            </div>
            <ul className="card contact-guarantees">
              {GUARANTEES.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
          <div className="contact-inquiry-form">
            <InquiryForm hideIntro />
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