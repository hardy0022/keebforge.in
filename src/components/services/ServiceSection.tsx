import Link from "next/link";
import type { Device, Service, ServiceGroup } from "@prisma/client";
import { PriceDisplay } from "@/components/ui/PriceDisplay";
import { SectionHead } from "@/components/ui/SectionHead";

const ICONS: Record<string, string> = {
  "krytox-205g0-lubing": "✨",
  "durock-films": "🔵",
  "tx-films": "⚪",
  "spring-swap-oil": "🌀",
  "switch-stem-tuning": "🟡",
  "full-stabilizer-service": "🛠️",
  "wire-balancing-only": "⚖️",
  "restore-old-stabilizers": "♻️",
  "solder-switches": "🔧",
  "desolder-switches": "🔩",
  "keyboard-build-60-65": "⌨️",
  "keyboard-build-tkl": "🖥️",
  "millmax-socket-install": "🔌",
  "hotswap-socket-install": "🔁",
  "split-keyboard-build": "🧩",
  "pcb-troubleshooting-repair": "🔬",
  "custom-pcb-design-layout": "📐",
  "pcb-fabrication-support": "🏭",
  "full-custom-keyboard-build": "🎛️",
  "firmware-upload-testing": "💾",
  "general-electronics-repair": "⚡",
  "switch-swap": "🖱️",
  "middle-side-switch-swap": "🔘",
  "tape-mod": "🧵",
  "skate-feet-replacement": "🛼",
  "encoder-replacement": "🎡",
  "mouse-diagnostics-repair": "🩺",
};

function serviceHref(svc: { slug: string; device: Device }) {
  const device = svc.device === "MOUSE" ? "mouse" : "keyboard";
  return `/services/${device}/${svc.slug}`;
}

function ServiceCard({ svc }: { svc: Service }) {
  const isQuote = svc.unit === "QUOTE" || (!svc.price && !svc.priceMin);
  const combo = svc.combo;
  const href = serviceHref(svc);

  if (combo) {
    const replaces: string[] = (svc.replaces as string[]) ?? [];
    return (
      <article className="card card-feat">
        <div className="feat-badge">{svc.popular ? "★ Most Popular" : "Combo"}</div>
        <div className="ch">
          <span className="ci">{ICONS[svc.slug] ?? "⚙️"}</span>
          <div className="cp">
            <PriceDisplay price={svc.price} priceMin={svc.priceMin} priceMax={svc.priceMax} unit={svc.unit} large />
            {svc.unit !== "FLAT" && <span className="cu">per switch</span>}
          </div>
        </div>
        <h3 className="ct">{svc.name}</h3>
        <p className="cd">{svc.description}</p>
        <ul className="feat-list">
          <li>
            <span className="chk">✓</span> {replaces[0] ? "Premium lube" : ""}
          </li>
          <li>
            <span className="chk">✓</span> Film Installation (Durock or TX)
          </li>
          <li>
            <span className="chk">✓</span> Spring Swap &amp; Oil
          </li>
        </ul>
        <Link href={href} className="btn-feat">
          Get This Deal
        </Link>
      </article>
    );
  }

  return (
    <article className="card">
      <div className="ch">
        <span className="ci">{ICONS[svc.slug] ?? "⚙️"}</span>
        <div className="cp">
          {isQuote ? (
            <span className="qbadge">Quote Based</span>
          ) : (
            <PriceDisplay price={svc.price} priceMin={svc.priceMin} priceMax={svc.priceMax} unit={svc.unit} />
          )}
          {!isQuote && svc.unit !== "FLAT" && (
            <span className="cu">{svc.priceLabel ?? (svc.unit === "PER_SWITCH" ? "per switch" : "each")}</span>
          )}
        </div>
      </div>
      <h3 className="ct">{svc.name}</h3>
      <p className="cd">{svc.description}</p>
    </article>
  );
}

/** Renders a full service section from a DB group. */
export function ServiceSection({ group, num }: { group: ServiceGroup & { services: Service[] }; num: string }) {
  const combo = group.services.find((s) => s.combo);
  const regular = group.services.filter((s) => !s.combo);
  const allQuote = group.services.every((s) => s.unit === "QUOTE");

  return (
    <section className="svc-section" aria-labelledby={`t-${group.slug}`}>
      <div className="wrap">
        <SectionHead num={num} title={group.name} desc={allQuote ? "Quoted after review — every build scoped to your exact requirements." : undefined} />
        <div className="cards-wide">
          {regular.map((svc) => (
            <ServiceCard key={svc.id} svc={svc} />
          ))}
          {combo && <ServiceCard key={combo.id} svc={combo} />}
        </div>
      </div>
    </section>
  );
}