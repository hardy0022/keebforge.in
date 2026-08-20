import Image from "next/image";
import Link from "next/link";

/** Static poster hero. The 207-frame scroll animation (Phase 10) mounts on top of this. */
export function Hero() {
  return (
    <section className="relative min-h-[100svh] flex items-center justify-center overflow-hidden bg-[var(--black)]">
      <div className="absolute inset-0" aria-hidden="true">
        <Image
          src="/images/poster.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
          style={{ filter: "brightness(0.5) saturate(0.8)" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(8,7,12,0.55)_70%,var(--black)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--black)]/60 via-transparent to-[var(--bg)]" />
      </div>

      <div className="wrap relative z-10 text-center pt-[var(--nav-h)]">
        <span className="inline-flex items-center gap-2 text-[0.62rem] font-bold tracking-[0.22em] uppercase text-[var(--acc)] border border-[var(--bdr)] rounded-full px-4 py-1.5 bg-[var(--bg1)]/80 backdrop-blur-sm">
          India-Wide Mail-In Service
        </span>
        <h1 className="mt-6 font-display font-bold tracking-[-0.03em] text-[var(--t1)] text-[clamp(2.2rem,7vw,4.5rem)] leading-[1.05]">
          Precision Keyboard
          <br />
          <span className="text-[var(--acc)] drop-shadow-[0_0_30px_var(--acc-glow)]">Builds &amp; Repairs</span>
        </h1>
        <p className="mx-auto mt-5 max-w-[520px] text-[0.95rem] leading-relaxed text-[var(--t2)]">
          Mechanical keyboard and mouse repair, soldering, and custom builds — handled by a dedicated electronics
          engineer in Jammu &amp; Kashmir, shipped anywhere in India.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/checkout" className="btn-prime btn-prime-lg">
            Place an Order
            <span aria-hidden="true">→</span>
          </Link>
          <Link href="/services/keyboard" className="btn-ghost">
            View Services
          </Link>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[var(--t3)] text-[0.62rem] tracking-[0.22em] uppercase">
        Scroll
        <span className="text-[var(--acc)]" aria-hidden="true">
          ↓
        </span>
      </div>
    </section>
  );
}