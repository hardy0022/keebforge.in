import type { Metadata } from "next";
import { PageHero } from "@/components/ui/PageHero";
import { buildMetadata } from "@/lib/seo";
import { getServiceCatalog } from "@/lib/data";
import { ServiceConfigurator, type ConfigService } from "@/components/services/ServiceConfigurator";

export const metadata: Metadata = buildMetadata({
  title: "Keyboard & Mouse Service Pricing | KeebForge",
  description:
    "Configure keyboard and mouse repair services — switch lubing, stabilizer tuning, soldering, builds, PCB work and mouse repairs. Live estimate as you select.",
  path: "/services",
});

export default async function ServicesPage() {
  const groups = await getServiceCatalog();

  const config: { name: string; slug: string; services: ConfigService[] }[] = groups.map((g) => ({
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
      <PageHero
        tag="Services & Pricing"
        title="Keyboard & Mouse Service Pricing"
        desc="Configure your service request below. Pricing updates automatically as you make selections."
      />
      <ServiceConfigurator groups={config} />
    </main>
  );
}