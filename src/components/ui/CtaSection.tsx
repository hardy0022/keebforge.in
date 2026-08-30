import Link from "next/link";
import type { ReactNode } from "react";

export function CtaSection({
  title,
  desc,
  note,
  primaryLabel = "Shop Now",
  primaryHref = "/shop",
  tag = "Let&apos;s build something great",
}: {
  title: ReactNode;
  desc?: string;
  note?: ReactNode;
  primaryLabel?: string;
  primaryHref?: string;
  tag?: string;
}) {
  return (
    <section className="cta-section" aria-labelledby="cta-t">
      <div className="cta-deco" aria-hidden="true" />
      <div className="cta-wrap">
        <span className="cta-tag">{tag}</span>
        <h2 className="cta-title" id="cta-t">
          {title}
        </h2>
        {desc && <p className="cta-desc">{desc}</p>}
        {note && (
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--bdr)] bg-[var(--bg1)] px-5 py-2.5 mb-6 text-[0.82rem] text-[var(--t2)]">
            <span aria-hidden="true">🇮🇳</span>
            <span>{note}</span>
          </div>
        )}
        <div className="flex gap-3.5 justify-center flex-wrap">
          <Link href={primaryHref} className="btn-prime btn-prime-lg">
            {primaryLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}