import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { SectionHead } from "@/components/ui/SectionHead";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "About KeebForge — Keyboard & Mouse Repair Workshop in India",
  description:
    "Hi, I'm Hardik Sharma. KeebForge is a Jammu & Kashmir workshop for mail-in micro-soldering repairs, custom keyboard layouts and high-consistency tuning — serving enthusiasts across India.",
  path: "/about",
});

const STATS = [
  { num: "600+", label: "Switches Lubed" },
  { num: "50+", label: "Keyboards Serviced" },
  { num: "India", label: "Mail-in Service" },
  { num: "Eng.", label: "Electronics Background" },
];

const PHILOSOPHY = [
  { icon: "⚙️", title: "Engineering First", desc: "Every modification is approached like an engineering problem, not just a cosmetic upgrade." },
  { icon: "🔬", title: "Component-Level Repair", desc: "Damaged pads, lifted traces, broken USB ports and PCB faults." },
  { icon: "🎧", title: "Sound Tuning", desc: "Foams, stabilizers, switches and acoustics." },
  { icon: "📦", title: "Mail-in Service", desc: "Customers from all over India ship keyboards directly to my workshop." },
];

const WHY = [
  "Electronics Engineer — not just keyboard assembly, actual PCB design and circuit repair.",
  "One Person, One Standard — every keyboard is worked on by me. No outsourcing.",
  "Component-Level Repairs — USB ports, traces, lifted pads, ESD damage and soldering issues.",
  "India-Wide Mail-In — secure packaging guidance, order tracking and insured shipping.",
  "Quality Before Speed — every board is tested before dispatch.",
];

const CHRONICLE = [
  { year: "2023", title: "First Mechanical Keyboard", desc: "Got my first mechanical keyboard." },
  { year: "2024", title: "Modding Begins", desc: "Began experimenting with mechanical physical layouts, fine-tuning switch acoustics, and researching lubricant composition behavior types." },
  { year: "2025", title: "PCB Repairs", desc: "Expanded workspace infrastructure to address trace micro-soldering repairs, fixing torn pads, and correcting logic element shorts." },
  { year: "2026", title: "KeebForge.in Launched", desc: "Launched a unified national portal to offer verified board repairs and switch services across India." },
  { year: "Today", title: "Serving All of India", desc: "Processing custom tier layout builds, split ergonomic systems, and high-tier micro-soldering with consistent execution metrics." },
];

const SOCIAL = [
  { label: "Discord Chat", value: "hardy_022", href: "https://discord.com/users/843113968734437376" },
  { label: "Reddit", value: "u/hardy_022", href: "https://www.reddit.com/user/hardy_022/" },
  { label: "Instagram", value: "@nowitshardik", href: "https://www.instagram.com/nowitshardik/" },
  { label: "Direct Mail", value: "contact@keebforge.in", href: "mailto:contact@keebforge.in" },
];

export default function AboutPage() {
  return (
    <main>
      <PageHero
        tag="About"
        title="About KeebForge"
        desc="A keyboard & mouse repair workshop in India — mail-in micro-soldering, custom layouts and high-consistency tuning from Jammu & Kashmir."
      />

      <section className="svc-section" aria-labelledby="t-hello">
        <div className="wrap">
          <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr] items-start">
            <div>
              <SectionHead title="Hi, I'm Hardik Sharma." />
              <p className="text-[0.92rem] leading-relaxed text-[var(--t2)] mb-4">
                I started KeebForge because I wasn&apos;t satisfied with rushed keyboard services. Every build that arrives
                on my bench is treated like my own — from complex PCB diagnostics to the final keypress test.
              </p>
              <p className="text-[0.92rem] leading-relaxed text-[var(--t2)]">
                Operating out of <strong style={{ color: "var(--t1)" }}>Jammu &amp; Kashmir</strong>, I manage a technical
                workshop specialized for mail-in micro-soldering repairs, custom layout designs, and high-consistency
                tuning. Your hardware is processed safely with technical oversight and premium logic analyzers.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {STATS.map((s) => (
                <div key={s.label} className="card !p-5 text-center">
                  <div className="font-display font-bold text-[clamp(1.4rem,3vw,2rem)] text-[var(--acc)] leading-none">
                    {s.num}
                  </div>
                  <div className="mt-2 text-[0.62rem] uppercase tracking-[0.08em] text-[var(--t3)]">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="svc-section" aria-labelledby="t-philosophy">
        <div className="wrap">
          <SectionHead num="01 // Philosophy" title="Engineering Philosophy" />
          <div className="card max-w-[760px]">
            <p className="cd">
              I believe a keyboard should feel consistent across every key. Modifications shouldn&apos;t just look custom;
              they must be implemented logically to minimize physical housing stress and optimize acoustics layout
              variables.
            </p>
          </div>
          <div className="grid gap-3 mt-6 max-w-[760px] sm:grid-cols-2">
            <div className="info-card">
              <h3>What I Actually Do</h3>
              <p>Lubing · Spring swapping · PCB repair · Mill-Max · Firmware · Stabilizer tuning</p>
            </div>
            <div className="info-card">
              <h3>The Workshop</h3>
              <p>Temperature controlled soldering · ESD protection · Premium lubricants</p>
            </div>
          </div>
        </div>
      </section>

      <section className="svc-section" aria-labelledby="t-chronicle">
        <div className="wrap">
          <SectionHead num="02 // Chronicle" title="The Development Path" />
          <div className="flex flex-col max-w-[760px]">
            {CHRONICLE.map((c, i) => (
              <div key={c.year} className="flex gap-5">
                <div className="flex flex-col items-center">
                  <span className="w-3 h-3 rounded-full border-2 border-[var(--acc)] bg-[var(--bg)] mt-1.5" />
                  {i < CHRONICLE.length - 1 && <span className="w-px flex-1 bg-[var(--bdr)]" />}
                </div>
                <div className="pb-8">
                  <div className="font-display font-bold text-[0.68rem] uppercase tracking-[0.14em] text-[var(--acc)]">
                    {c.year}
                  </div>
                  <h3 className="font-display font-bold text-[1rem] text-[var(--t1)] mt-1">{c.title}</h3>
                  <p className="text-[0.82rem] text-[var(--t2)] leading-relaxed mt-1.5 max-w-[560px]">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <blockquote className="mt-4 max-w-[760px] font-display font-bold text-[clamp(1.1rem,2.5vw,1.5rem)] leading-snug text-[var(--t1)]">
            No rushed builds. No mystery lubricants. No shortcuts.
            <span className="block mt-2 text-[0.8rem] font-normal text-[var(--t3)]">Only work I&apos;d happily use myself.</span>
          </blockquote>
        </div>
      </section>

      <section className="svc-section" aria-labelledby="t-about-keebforge">
        <div className="wrap">
          <SectionHead num="03 // About KeebForge" title="Built Around Precision" desc="KeebForge isn't a reseller. It's a workshop dedicated to mechanical keyboard engineering. Consistency matters." />
          <div className="cards-wide">
            {PHILOSOPHY.map((p) => (
              <article className="card" key={p.title}>
                <div className="ch">
                  <span className="ci" aria-hidden="true">{p.icon}</span>
                </div>
                <h3 className="ct">{p.title}</h3>
                <p className="cd">{p.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="svc-section" aria-labelledby="t-why">
        <div className="wrap">
          <SectionHead num="04 // Why KeebForge" title="The Engineering Standard" />
          <ul className="flex flex-col gap-3 max-w-[720px]">
            {WHY.map((w) => (
              <li key={w} className="flex gap-3 items-start bg-[var(--bg1)] border border-[var(--bdr)] rounded-[var(--r-sm)] p-4">
                <span className="chk mt-0.5" aria-hidden="true">✓</span>
                <span className="text-[0.85rem] text-[var(--t2)] leading-relaxed">{w}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="svc-section" aria-labelledby="t-contact">
        <div className="wrap">
          <SectionHead num="05 // Connect" title="Find Me Online" />
          <div className="cards">
            {SOCIAL.map((s) => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener" className="card card-q">
                <h3 className="ct">{s.label}</h3>
                <p className="cd" style={{ color: "var(--acc)" }}>{s.value}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <CtaSection
        title={
          <>
            Ready to Build
            <br />
            Something Better?
          </>
        }
      />
    </main>
  );
}