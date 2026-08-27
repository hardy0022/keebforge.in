import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getServiceCatalog } from "@/lib/data";
import { DEFAULT_SHIPPING_MODE, enabledShippingModes } from "@/lib/shipping";
import { ServiceConfigurator, type ConfigService } from "@/components/services/ServiceConfigurator";
import { WhyForge } from "@/components/home/WhyForge";

export const metadata: Metadata = buildMetadata({
  title: "Keyboard & Mouse Mods | KeebForge",
  description:
    "Keyboard and mouse modifications to improve performance, feel, sound, and functionality — switch lubing, stabilizer work, soldering, tape mods and mouse switch swaps. Live estimate as you select.",
  path: "/mods",
});

/** Items hidden from the configurator (custom-build / PCB work is quoted offline). */
const HIDDEN_GROUP_SLUGS = new Set(["custom-pcb-design"]);
const HIDDEN_SERVICE_SLUGS = new Set([
  "keyboard-build-60-65",
  "keyboard-build-tkl",
  "split-keyboard-build",
  "pcb-troubleshooting-repair",
  "encoder-replacement",
  "mouse-diagnostics-repair",
  "switch-stem-tuning",
  "durock-films",
  "tx-films",
  "spring-swap-oil",
  "complete-mod-combo",
]);

export default async function ServicesPage() {
  const groups = await getServiceCatalog();

  const visibleGroups = groups
    .filter((g) => !HIDDEN_GROUP_SLUGS.has(g.slug))
    .map((g) => ({ ...g, services: g.services.filter((s) => !HIDDEN_SERVICE_SLUGS.has(s.slug)) }))
    .filter((g) => g.services.length > 0);

  const config: { name: string; slug: string; services: ConfigService[] }[] = visibleGroups.map((g) => ({
    name: g.name,
    slug: g.slug,
    services: g.services.map((svc) => ({
      id: svc.id,
      slug: svc.slug,
      name: svc.name,
      description: svc.description,
      device: svc.device,
      unit: svc.unit,
      price: svc.price,
      priceMin: svc.priceMin,
      priceMax: svc.priceMax,
      priceLabel: svc.priceLabel,
      combo: svc.combo,
      popular: svc.popular,
      highlight: svc.highlight,
      replaces: (svc.replaces as string[] | null) ?? null,
      exclusiveWith: (svc.exclusiveWith as string[] | null) ?? null,
      groupName: g.name,
      groupSlug: g.slug,
    })),
  }));

  return (
    <main className="config-page">
      <header className="ri-hero">
        <p className="sec-num sv-kicker">{"// Keyboard & Mouse Mods"}</p>
        <h1 className="ri-hero-title">Mods that improve performance, feel, sound, and function.</h1>
        <p className="ri-hero-desc">
          Keyboard and mouse modifications — switch lubing, stabilizer work, soldering, tape mods, mouse switch
          swaps and more. Choose what you need and we&apos;ll take care of the rest.
        </p>
      </header>

      <ServiceConfigurator
        groups={config}
        shippingModes={enabledShippingModes()}
        defaultShipMode={DEFAULT_SHIPPING_MODE}
      />

      <WhyForge num="// Why Forge" />
    </main>
  );
}
