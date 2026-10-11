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

const CHRONICLE = [
  {
    year: "2023",
    title: "First Mechanical Keyboard",
    desc: "Got my first mechanical keyboard.",
  },
  {
    year: "2024",
    title: "Modding Begins",
    desc: "Began experimenting with mechanical physical layouts, fine-tuning switch acoustics, and researching lubricant composition behavior types.",
  },
  {
    year: "2025",
    title: "PCB Repairs",
    desc: "Expanded workspace infrastructure to address trace micro-soldering repairs, fixing torn pads, and correcting logic element shorts.",
  },
  {
    year: "2026",
    title: "KeebForge.in Launched",
    desc: "Launched a unified national portal to offer verified board repairs and switch services across India.",
  },
  {
    year: "Today",
    title: "Serving All of India",
    desc: "Processing custom tier layout builds, split ergonomic systems, and high-tier micro-soldering with consistent execution metrics.",
  },
];

const SOCIAL = [
  {
    label: "Discord Chat",
    value: "hardy_022",
    href: "https://discord.com/users/843113968734437376",
    icon: (
      <svg viewBox="0 0 24 24" fill="#5865F2" aria-hidden="true">
        <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286ZM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189Zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
      </svg>
    ),
  },
  {
    label: "Reddit",
    value: "u/hardy_022",
    href: "https://www.reddit.com/user/hardy_022/",
    icon: (
      <svg viewBox="0 0 24 24" fill="#FF4500" aria-hidden="true">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
      </svg>
    ),
  },
  {
    label: "Instagram",
    value: "@nowitshardik",
    href: "https://www.instagram.com/nowitshardik/",
    icon: (
      <svg viewBox="0 0 24 24" fill="#E4405F" aria-hidden="true">
        <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z" />
      </svg>
    ),
  },
  {
    label: "Direct Mail",
    value: "contact@keebforge.in",
    href: "mailto:contact@keebforge.in",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    ),
  },
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
                I started KeebForge because I wasn&apos;t satisfied with rushed
                keyboard services. Every build that arrives on my bench is
                treated like my own — from complex PCB diagnostics to the final
                keypress test.
              </p>
              <p className="text-[0.92rem] leading-relaxed text-[var(--t2)]">
                Operating out of{" "}
                <strong style={{ color: "var(--t1)" }}>
                  Jammu &amp; Kashmir
                </strong>
                , I manage a technical workshop specialized for mail-in
                micro-soldering repairs, custom layout designs, and
                high-consistency tuning. Your hardware is processed safely with
                technical oversight and premium logic analyzers.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {STATS.map((s) => (
                <div key={s.label} className="card !p-5 text-center">
                  <div className="font-display font-bold text-[clamp(1.4rem,3vw,2rem)] text-[var(--acc)] leading-none">
                    {s.num}
                  </div>
                  <div className="mt-2 text-[0.62rem] uppercase tracking-[0.08em] text-[var(--t3)]">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="svc-section" aria-labelledby="t-chronicle">
        <div className="wrap">
          <SectionHead num="// Chronicle" title="The Development Path" />
          <div className="flex flex-col max-w-[760px]">
            {CHRONICLE.map((c, i) => (
              <div key={c.year} className="flex gap-5">
                <div className="flex flex-col items-center">
                  <span className="w-3 h-3 rounded-full border-2 border-[var(--acc)] bg-[var(--bg)] mt-1.5" />
                  {i < CHRONICLE.length - 1 && (
                    <span className="w-px flex-1 bg-[var(--bdr)]" />
                  )}
                </div>
                <div className="pb-8">
                  <div className="font-display font-bold text-[0.68rem] uppercase tracking-[0.14em] text-[var(--acc)]">
                    {c.year}
                  </div>
                  <h3 className="font-display font-bold text-[1rem] text-[var(--t1)] mt-1">
                    {c.title}
                  </h3>
                  <p className="text-[0.82rem] text-[var(--t2)] leading-relaxed mt-1.5 max-w-[560px]">
                    {c.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <blockquote className="mt-4 max-w-[760px] font-display font-bold text-[clamp(1.1rem,2.5vw,1.5rem)] leading-snug text-[var(--t1)]">
            No rushed builds. No mystery lubricants. No shortcuts.
            <span className="block mt-2 text-[0.8rem] font-normal text-[var(--t3)]">
              Only work I&apos;d happily use myself.
            </span>
          </blockquote>
        </div>
      </section>

      <section className="svc-section" aria-labelledby="t-contact">
        <div className="wrap">
          <SectionHead num="// Connect" title="Find Me Online" />
          <div className="cards">
            {SOCIAL.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener"
                className="card card-q social-card"
              >
                <div className="social-row">
                  <span className="social-brand">{s.icon}</span>
                  <h3 className="ct" style={{ marginBottom: 0 }}>
                    {s.label}
                  </h3>
                </div>
                <p className="cd" style={{ color: "var(--acc)" }}>
                  {s.value}
                </p>
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
