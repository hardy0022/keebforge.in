/**
 * Generic configurable-product options: shared by the product page
 * configurator, add-to-cart action, cart rendering, checkout recalculation
 * and admin sync. Pure functions — safe on client and server.
 *
 * Price model: unit price = product base price (paise) + sum of selected
 * options' priceAddon. The server ALWAYS recomputes this; frontend values
 * are display-only.
 */

export type ResolvedOption = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  addon: number; // paise snapshot at time of resolution
};

export type OptionGroupLike = {
  id: string;
  name: string;
  required: boolean;
  enabled: boolean;
  options: {
    id: string;
    name: string;
    priceAddon: number;
    enabled: boolean;
  }[];
};

export type ConfigResolution =
  | { ok: true; unitPrice: number; selections: ResolvedOption[] }
  | { ok: false; error: string };

/** Stable identity of a configuration — used to merge identical cart lines. */
export function configKey(optionIds: string[]): string {
  return [...optionIds].sort().join("|");
}

/**
 * The base/default option for a group, i.e. the one that defines the baseline
 * configuration. There is no explicit "isDefault" flag in the model, so the
 * safest convention is the first enabled option (options arrive pre-sorted by
 * sortOrder then name) whose priceAddon is zero — the configuration that
 * matches the product base price. Falls back to the first enabled option.
 */
export function defaultOptionId(group: OptionGroupLike): string | null {
  const enabled = group.options.filter((o) => o.enabled);
  return enabled.find((o) => o.priceAddon === 0)?.id ?? enabled[0]?.id ?? null;
}

/**
 * Recomputes the configured unit price from live group/option data.
 * Validates that every required group has exactly one selection, every
 * selected option belongs to this product and is enabled.
 */
export function resolveConfiguredPrice(
  groups: OptionGroupLike[],
  basePrice: number,
  optionIds: string[]
): ConfigResolution {
  const wanted = new Set(optionIds);
  if (wanted.size !== optionIds.length) {
    return { ok: false, error: "Duplicate option selection." };
  }

  const activeGroups = groups.filter((g) => g.enabled);
  const selections: ResolvedOption[] = [];
  let total = basePrice;

  for (const g of activeGroups) {
    const chosen = g.options.filter((o) => o.enabled && wanted.has(o.id));
    if (chosen.length > 1) {
      return { ok: false, error: `Multiple selections in "${g.name}".` };
    }
    if (chosen.length === 0 && g.required) {
      return { ok: false, error: `Choose an option for "${g.name}".` };
    }
    if (chosen.length === 1) {
      total += chosen[0].priceAddon;
      selections.push({
        groupId: g.id,
        groupName: g.name,
        optionId: chosen[0].id,
        optionName: chosen[0].name,
        addon: chosen[0].priceAddon,
      });
      wanted.delete(chosen[0].id);
    }
  }

  // Any leftover ids point at unknown/disabled options — reject so stale or
  // tampered payloads never reach the cart.
  if (wanted.size > 0) {
    return { ok: false, error: "Invalid option selection." };
  }

  return { ok: true, unitPrice: total, selections };
}

/** CartItem.config / OrderItem.variantInfo snapshot shape. */
export type ProductConfigSnapshot = {
  kind: "options";
  optionIds: string[];
  selections: ResolvedOption[];
};

export function configSnapshot(resolution: Extract<ConfigResolution, { ok: true }>): ProductConfigSnapshot {
  return {
    kind: "options",
    optionIds: resolution.selections.map((s) => s.optionId),
    selections: resolution.selections,
  };
}

// ── Self-check ───────────────────────────────────────────────────────────────
// npx tsx src/lib/product-options.ts
if (process.argv[1]?.endsWith("product-options.ts")) {
  const groups: OptionGroupLike[] = [
    {
      id: "g1",
      name: "Case Color",
      required: true,
      enabled: true,
      options: [
        { id: "o1", name: "Black", priceAddon: 0, enabled: true },
        { id: "o2", name: "Brass", priceAddon: 350000, enabled: true },
        { id: "o3", name: "Hidden", priceAddon: 1, enabled: false },
      ],
    },
    {
      id: "g2",
      name: "Foam",
      required: false,
      enabled: true,
      options: [{ id: "o4", name: "Poron", priceAddon: 15000, enabled: true }],
    },
    { id: "g3", name: "Disabled group", required: true, enabled: false, options: [] },
  ];
  const base = 1000000;

  const good = resolveConfiguredPrice(groups, base, ["o2", "o4"]);
  console.assert(good.ok && good.unitPrice === 1365000 && good.selections.length === 2, "good path");

  const missing = resolveConfiguredPrice(groups, base, ["o4"]);
  console.assert(!missing.ok, "missing required");

  const stale = resolveConfiguredPrice(groups, base, ["o2", "o3"]);
  console.assert(!stale.ok, "disabled option rejected");

  const dupe = resolveConfiguredPrice(groups, base, ["o1", "o1"]);
  console.assert(!dupe.ok, "duplicate rejected");

  const optionalSkipped = resolveConfiguredPrice(groups, base, ["o1"]);
  console.assert(optionalSkipped.ok && optionalSkipped.unitPrice === base, "optional skipped");

  console.assert(defaultOptionId(groups[0]) === "o1", "default = first zero-addon option");
  console.assert(defaultOptionId(groups[1]) === "o4", "default falls back to only option");

  console.log("product-options self-check passed");
}
