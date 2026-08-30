import Link from "next/link";
import { Reveal } from "@/components/home/Reveal";

export function FinalCta() {
  return (
    <section className="hp-final" aria-labelledby="final-cta">
      <div className="hp-final-glow" aria-hidden="true" />
      <div className="hp-final-inner">
        <Reveal as="h2" id="final-cta" className="hp-final-title">
          Ready to build
          <br />
          something better?
        </Reveal>
        <Reveal as="p" className="hp-final-sub" delay={120}>
          Build a keyboard. Tune your board. Send us your repair.
        </Reveal>
        <Reveal className="hp-final-cta" delay={220}>
          <Link href="/shop/custom" className="btn-prime btn-prime-lg">
            Start a Build <span aria-hidden="true">→</span>
          </Link>
        </Reveal>
      </div>
    </section>
  );
}