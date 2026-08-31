import Link from "next/link";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { getServiceCatalog } from "@/lib/data";
import { GROUP_DESC } from "@/components/services/ServiceConfigurator";
import { ModsManager, type ModsDevice } from "./ModsManager";

export const metadata: Metadata = { title: "Mods | KeebForge Admin", robots: { index: false, follow: false } };

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

const DEVICE_META: Record<string, { title: string; subtitle: string }> = {
  KEYBOARD: { title: "Keyboard Mods", subtitle: "Manage services available for keyboard builds." },
  MOUSE: { title: "Mouse Mods", subtitle: "Manage services available for mouse repairs and modifications." },
};

export default async function AdminModsPage() {
  await requirePermission("service", "view");
  const groups = await getServiceCatalog();

  const devices: ModsDevice[] = (["KEYBOARD", "MOUSE"] as const)
    .map((device) => {
      const gs = groups
        .filter((g) => g.device === device && !HIDDEN_GROUP_SLUGS.has(g.slug))
        .map((g) => ({
          id: g.id,
          name: g.name,
          desc: GROUP_DESC[g.slug] ?? null,
          services: g.services
            .filter((s) => !HIDDEN_SERVICE_SLUGS.has(s.slug))
            .map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              unit: s.unit,
              price: s.price,
              priceMin: s.priceMin,
              priceMax: s.priceMax,
              priceLabel: s.priceLabel,
            })),
        }))
        .filter((g) => g.services.length > 0);
      return {
        device,
        title: DEVICE_META[device].title,
        subtitle: DEVICE_META[device].subtitle,
        groups: gs,
      };
    })
    .filter((d) => d.groups.length > 0);

  const devCount = (d: ModsDevice) => d.groups.reduce((n, g) => n + g.services.length, 0);
  const totals = {
    keyboard: devCount(devices.find((d) => d.device === "KEYBOARD") ?? { device: "KEYBOARD", title: "", subtitle: "", groups: [] }),
    mouse: devCount(devices.find((d) => d.device === "MOUSE") ?? { device: "MOUSE", title: "", subtitle: "", groups: [] }),
    services: devices.reduce((n, d) => n + devCount(d), 0),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Link href="/admin" className="muted" style={{ fontSize: "0.75rem" }}>← Dashboard</Link>
      <ModsManager devices={devices} totals={totals} />
    </div>
  );
}
