import Link from "next/link";
import Image from "next/image";
import { Reveal } from "@/components/home/Reveal";
import { cldUrl } from "@/lib/cloudinary-url";
import type { HomeWork } from "@/lib/home";

const MODS_POINTS = ["Keyboard modifications", "Switch lubing", "Stabilizer tuning", "Soldering & switch work"];

function PathMedia({ image, title }: { image?: { url: string; alt?: string }; title: string }) {
  if (!image) return <div className="hp-path-media" />;
  return (
    <div className="hp-path-media">
      <Image src={cldUrl(image.url, 900)} alt={image.alt ?? title} fill sizes="(min-width: 1024px) 40vw, 100vw" />
    </div>
  );
}

export function ModsWorkshop({ work }: { work: HomeWork[] }) {
  const modsImage = work.find((w) => w.category === "CUSTOM_BUILD" || w.category === "MOD")?.images[0] ?? work[0]?.images[0];
  const workshopImage = work.find((w) => w.category === "REPAIR")?.images[0] ?? work[0]?.images[0];

  return (
    <section className="hp-pathways" aria-label="Mods and workshop">
      <Reveal as="div" className="hp-path hp-path--mods">
        <div className="hp-path-body">
          <p className="hp-kicker">
            <span className="hp-kicker-mark">{"//"}</span> Mods
          </p>
          <h2 className="hp-path-title">Make it yours.</h2>
          <ul className="hp-path-list">
            {MODS_POINTS.map((pt) => (
              <li key={pt}>{pt}</li>
            ))}
          </ul>
          <span className="btn-prime">
            Explore Mods <span aria-hidden="true">→</span>
          </span>
        </div>
        <PathMedia image={modsImage} title="Keyboard mods" />
        <Link href="/mods" className="hp-stretch" aria-label="Explore mods" />
      </Reveal>

      <Reveal as="div" className="hp-path hp-path--workshop" delay={90}>
        <PathMedia image={workshopImage} title="KeebForge workshop" />
        <div className="hp-path-body">
          <p className="hp-kicker">
            <span className="hp-kicker-mark">{"//"}</span> Workshop
          </p>
          <h2 className="hp-path-title">Fix it right.</h2>
          <ul className="hp-path-list">
            {["Repairs", "Restoration", "Custom work", "Electronics"].map((pt) => (
              <li key={pt}>{pt}</li>
            ))}
          </ul>
          <span className="btn-ghost">
            Visit Workshop <span aria-hidden="true">→</span>
          </span>
        </div>
        <Link href="/workshop" className="hp-stretch" aria-label="Visit the workshop" />
      </Reveal>
    </section>
  );
}