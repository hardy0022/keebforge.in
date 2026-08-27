import Link from "next/link";
import { SectionHead } from "@/components/ui/SectionHead";

const REASONS = [
  {
    num: "01",
    title: "Precision Work",
    desc: "Every build, modification, and repair is handled with attention to the small details that affect feel, sound, reliability, and performance.",
  },
  {
    num: "02",
    title: "Built & Tuned For You",
    desc: "From split keyboards and custom builds to switch lubing, stabilizer tuning, soldering, and firmware work — your setup is tailored to how you use it.",
  },
  {
    num: "03",
    title: "Mail-In Service",
    desc: "Ship your keyboard or mouse from anywhere in India. Get professional repair, tuning, or modification work without needing a local specialist.",
  },
];

export function WhyForge({ num }: { num?: string }) {
  return (
    <section className="info-section why-sec">
      <div className="wrap">
        <SectionHead
          num={num}
          title="WHY KEEBFORGE?"
          desc="Precision work for keyboards, mice, and custom builds — without the guesswork."
        />
        <div className="info-grid why-grid">
          {REASONS.map((r) => (
            <article key={r.num} className="info-card why-card">
              <span className="why-num" aria-hidden="true">
                {r.num}
              </span>
              <h3>{r.title}</h3>
              <p>{r.desc}</p>
            </article>
          ))}
        </div>
        <div className="why-cta">
          <Link href="/mods" className="btn-prime">
            Explore Mods →
          </Link>
          <Link href="/workshop" className="btn-ghost">
            Explore Workshop →
          </Link>
        </div>
      </div>
    </section>
  );
}
