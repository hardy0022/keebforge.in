import "server-only";
import { prisma } from "@/lib/prisma";
import type { ServiceConfig } from "./pricing";

/** Maps a Prisma Service row onto the pricing module's input shape. */
export function toModConfig(s: {
  id: string;
  slug: string;
  name: string;
  device: "KEYBOARD" | "MOUSE" | "OTHER";
  unit: "PER_SWITCH" | "PER_STABILIZER" | "FLAT" | "QUOTE";
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  priceLabel: string | null;
  groupId: string;
}): ServiceConfig {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    device: s.device,
    unit: s.unit,
    price: s.price,
    priceMin: s.priceMin,
    priceMax: s.priceMax,
    priceLabel: s.priceLabel,
    groupSlug: s.groupId,
  };
}

/**
 * Loads the requested services fresh from the DB (active only) in pricing
 * input shape — the server-authoritative source for any money math.
 */
export async function loadActiveModConfigs(ids: string[]): Promise<ServiceConfig[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.service.findMany({ where: { id: { in: ids }, active: true } });
  return rows.map(toModConfig);
}
