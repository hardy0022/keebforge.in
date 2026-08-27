import type { Metadata } from "next";
import { Hero } from "@/components/home/Hero";
import { WhyForge } from "@/components/home/WhyForge";
import { ServiceSection } from "@/components/services/ServiceSection";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata } from "@/lib/seo";
import { Marquee } from "@/components/ui/Marquee";
import { getServiceCatalog } from "@/lib/data";

export const metadata: Metadata = buildMetadata({
  title: "KeebForge — Mechanical Keyboard & Mouse Repair in India",
  description:
    "Mechanical keyboard and mouse repair, soldering, switch lubing, stabilizer tuning and custom builds. India-wide mail-in service.",
});

const MARQUEE_ITEMS = [
  "Custom Keyboard Builds",
  "Split Keyboard Builds",
  "Switch Lubing & Filming",
  "Stabilizer Tuning",
  "Soldering & Desoldering",
  "Hot-Swap Socket Repair",
  "PCB Troubleshooting",
  "Keyboard Modifications",
  "Mouse Switch & Encoder Work",
  "Keyboard Parts & Accessories",
];

export default async function HomePage() {
  const groups = await getServiceCatalog();

  return (
    <main>
      <Hero />
      <Marquee items={MARQUEE_ITEMS} />

      {groups.map((g, i) => (
        <ServiceSection key={g.id} group={g} num={`0${i + 1} // ${g.device === "MOUSE" ? "Mouse" : "Keyboard"}`} />
      ))}

      <WhyForge num={`0${groups.length + 1} // Why Forge`} />

      <CtaSection
        title={
          <>
            Place Your
            <br />
            Order Today
          </>
        }
      />
    </main>
  );
}