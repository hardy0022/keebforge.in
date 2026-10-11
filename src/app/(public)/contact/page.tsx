import type { Metadata } from "next";
import { Panel } from "@/components/ui/Panel";
import { InquiryForm } from "@/components/contact/InquiryForm";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Contact KeebForge — Repair Inquiries | KeebForge",
  description:
    "Questions about a repair, a quote for PCB work, or a custom build in mind? Contact KeebForge — a mail-in keyboard and mouse repair service available across India.",
  path: "/contact",
});

const CHANNELS = [
  {
    icon: "💬",
    title: "Discord",
    desc: "Questions, quotes and order confirmations. Reach Hardy on Discord.",
    href: "https://discord.com/users/843113968734437376",
    label: "Chat on Discord",
  },
  {
    icon: "✉️",
    title: "Email",
    desc: "Repair inquiries can be sent to contact@keebforge.in via the form below.",
    href: "mailto:contact@keebforge.in",
    label: "contact@keebforge.in",
  },
];

const GUARANTEES = [
  "Describe the issue clearly",
  "Add photos if possible",
  "We'll review it and get back as soon as possible",
];

export default function ContactPage() {
  return (
    <main className="ri-page">
      <header className="ri-hero">
        <p className="sec-num">{"// Contact"}</p>
        <h1 className="ri-hero-title">Contact KeebForge</h1>
        <p className="ri-hero-desc">
          Questions about a repair, a quote for PCB work, or a custom build in
          mind? Send an inquiry below — we&apos;ll get back to you with a quote.
        </p>
      </header>

      <section className="ri-layout">
        <div className="ri-main">
          <InquiryForm />
        </div>
        <aside className="ri-side">
          <div className="contact-aside">
            <Panel
              tag="Direct Contact"
              title="Reach me directly"
              className="panel"
            >
              <div className="contact-channel-list">
                {CHANNELS.map((c) => (
                  <a
                    key={c.title}
                    href={c.href}
                    target={c.href.startsWith("http") ? "_blank" : undefined}
                    rel="noopener"
                    className="contact-channel"
                  >
                    <span className="contact-channel-ico" aria-hidden="true">
                      {c.icon}
                    </span>
                    <span className="contact-channel-body">
                      <span className="contact-channel-name">{c.title}</span>
                      <span className="contact-channel-desc">{c.desc}</span>
                      <span className="contact-channel-link">{c.label}</span>
                    </span>
                  </a>
                ))}
              </div>
            </Panel>
            <Panel tag="Before You Send" title="Helpful details" className="panel">
              <ul className="contact-guarantees">
                {GUARANTEES.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </Panel>
          </div>
        </aside>
      </section>
    </main>
  );
}
