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
          style={{ filter: "brightness(0.58) saturate(0.8)" }}
        />
        {/* Layered scrims: dark core behind the text, soft vignette at the edges,
            fade into the page background at the bottom. Keyboard stays visible. */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_52%_at_50%_46%,rgba(5,5,9,0.8)_0%,rgba(6,6,10,0.45)_48%,transparent_78%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(8,7,12,0.5)_80%,var(--black)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--black)]/70 via-transparent to-[var(--bg)]" />
      </div>

      <div className="wrap relative z-10 text-center pt-[var(--nav-h)] pb-[9vh]">
        <h1 className="font-display font-bold tracking-[-0.03em] text-[var(--t1)] text-[clamp(2rem,5.5vw,3.6rem)] leading-[1.05]">
          Precision Keyboard
          <br />
          <span className="text-[var(--acc)] drop-shadow-[0_0_30px_var(--acc-glow)]">Builds, Tuning &amp; Repairs</span>
        </h1>
        <p className="mx-auto mt-4 max-w-[500px] text-[0.92rem] leading-relaxed text-[var(--t2)]">
          Custom builds, keyboard tuning, soldering, and mouse repairs — professionally handled and available across
          India.
        </p>
        <div className="hero-cta mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <Link href="/shop" className="btn-prime btn-prime-lg">
            Shop Builds
            <span aria-hidden="true">→</span>
          </Link>
          <Link href="/mods" className="btn-ghost">
            Explore Mods
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        <p className="mt-6 text-[0.68rem] tracking-[0.08em] text-[var(--t3)]">
          Mail-in Service &nbsp;•&nbsp; Custom Builds &nbsp;•&nbsp; Keyboard &amp; Mouse &nbsp;•&nbsp; India-wide
        </p>
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
