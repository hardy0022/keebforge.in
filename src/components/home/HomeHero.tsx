"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { DiaTextReveal } from "@/components/ui/dia-text-reveal";
import type { AnimatedIconHandle } from "@/components/ui/types";
import TravelBag from "@/components/ui/travel-bag";
import SlidersHorizontalIcon from "@/components/ui/sliders-horizontal-icon";
import CpuIcon from "@/components/ui/cpu-icon";
import PlugConnectedIcon from "@/components/ui/plug-connected-icon";

const SERVICE_ICONS = {
  customBuilds: TravelBag,
  tuning: SlidersHorizontalIcon,
  soldering: CpuIcon,
  repairs: PlugConnectedIcon,
};

const SERVICES = [
  { title: "Custom Builds", desc: "Handcrafted keyboards built around your needs.", icon: SERVICE_ICONS.customBuilds },
  { title: "Tuning", desc: "Switch lubing, stabilizer tuning, foam mod & more.", icon: SERVICE_ICONS.tuning },
  { title: "Soldering", desc: "Professional soldering for mods and custom builds.", icon: SERVICE_ICONS.soldering },
  { title: "Repairs", desc: "Keyboard & mouse repairs done right.", icon: SERVICE_ICONS.repairs },
];

type Service = (typeof SERVICES)[number];

function ServiceItem({ service }: { service: Service }) {
  const iconRef = useRef<AnimatedIconHandle>(null);
  const Icon = service.icon;
  return (
    <div
      className="hp-feature-item"
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
    >
      <span className="hp-feature-icon">
        <Icon ref={iconRef} />
      </span>
      <div>
        <h3 className="hp-service-title">{service.title}</h3>
        <p className="hp-service-desc">{service.desc}</p>
      </div>
    </div>
  );
}

export function HomeHero() {
  return (
    <section className="hp-hero" aria-label="KeebForge — precision keyboard builds, tuning and repairs">
      <div className="hp-hero-glow" aria-hidden="true" />

      <div className="hp-hero-main">
        <div className="hp-hero-grid">
          <div className="hp-hero-text">
            <p className="hp-kicker">
              <span className="hp-kicker-mark">{"//"}</span> KeebForge.in
            </p>
            <h1 className="hp-hero-title">
              Precision
              <br />
              keyboard builds,
              <br />
              <DiaTextReveal
                text="tuning & repairs."
                textColor="#f5f5fa"
                colors={["#c9f31d", "#eaff6a", "#8ec900"]}
                duration={1.1}
              />
            </h1>
            <p className="hp-hero-sub">
              Custom builds, keyboard tuning, soldering, and mouse repairs —
              professionally handled from the KeebForge workshop.
            </p>
            <div className="hp-hero-cta">
              <Link href="/shop" className="btn-prime btn-prime-lg">
                Shop Builds <span aria-hidden="true">→</span>
              </Link>
              <Link href="/mods" className="btn-ghost">
                Explore Mods <span aria-hidden="true">→</span>
              </Link>
            </div>
            <p className="hp-hero-meta">
              Mail-in Service <span aria-hidden="true">·</span> Custom Builds{" "}
              <span aria-hidden="true">·</span> Keyboard &amp; Mouse{" "}
              <span aria-hidden="true">·</span> India-wide
            </p>
          </div>

          <div className="hp-hero-visual">
            <div className="hp-hero-frame">
              <div className="hp-hero-note hp-hero-note-tl" aria-hidden="true">
                <span className="hp-note-bracket hp-note-bracket-tl" />
                <span className="hp-note-text hp-note-text-tl">BUILT WITH PRECISION</span>
              </div>
              <div className="hp-hero-visual-frame">
                <Image
                  src="/hero-background.png"
                  alt="KeebForge custom mechanical keyboard"
                  fill
                  priority
                  sizes="(min-width: 1024px) 44vw, 100vw"
                  className="hp-hero-visual-img"
                />
              </div>
              <div className="hp-hero-note hp-hero-note-br" aria-hidden="true">
                <span className="hp-note-text hp-note-text-br">
                  SWITCHES
                  <br />
                  TUNED
                  <br />
                  TESTED
                  <br />
                  PERFECTED
                </span>
                <span className="hp-note-bracket hp-note-bracket-br" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="hp-feature-strip" aria-label="KeebForge services">
        <div className="hp-feature-strip-inner">
          {SERVICES.map((s) => (
            <ServiceItem key={s.title} service={s} />
          ))}
        </div>
      </div>
    </section>
  );
}