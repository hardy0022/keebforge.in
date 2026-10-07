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

/** How a group is selected: exactly one (radio) or zero-or-more (checkbox). */
export type SelectionMode = "SINGLE" | "MULTIPLE";

export type OptionGroupLike = {
  id: string;
  name: string;
  /** Absent = legacy row: behaves as SINGLE (radio). */
  selectionMode?: SelectionMode;
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
 * Effective selection mode of a group. A group with no explicit mode is a
 * legacy SINGLE group — that is the pre-existing behaviour and the default.
 */
export function selectionModeOf(
  group: Pick<OptionGroupLike, "selectionMode">,
): SelectionMode {
  return group.selectionMode === "MULTIPLE" ? "MULTIPLE" : "SINGLE";
}

/**
 * Rendered input control for a group: radio for SINGLE, checkbox for MULTIPLE.
 * Drives the product-page configurator markup; kept here so the radio/checkbox
 * decision is a tested pure function.
 */
export function optionControlKind(
  group: Pick<OptionGroupLike, "selectionMode">,
): "radio" | "checkbox" {
  return selectionModeOf(group) === "MULTIPLE" ? "checkbox" : "radio";
}

/**
 * Display-side price: base + sum of add-ons of every selected, enabled option.
 * No validation — the server resolver below is the authoritative gate. Shared
 * by the product-page configurator so "changing selections updates the price
 * immediately" is a tested pure function rather than inline JSX math.
 */
export function sumSelectedAddons(
  groups: OptionGroupLike[],
  optionIds: string[],
): number {
  const wanted = new Set(optionIds);
  let total = 0;
  for (const g of groups) {
    if (!g.enabled) continue;
    for (const o of g.options) {
      if (o.enabled && wanted.has(o.id)) total += o.priceAddon;
    }
  }
  return total;
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
 * Validates that every required group has a selection, every selected option
 * belongs to this product and is enabled.
 *
 * - SINGLE (default): exactly one selection per group; a required group must
 *   have one, an optional group may have none but never more than one.
 * - MULTIPLE: zero or more selections; a required group must have at least
 *   one. Selected add-ons are summed.
 */
export function resolveConfiguredPrice(
  groups: OptionGroupLike[],
  basePrice: number,
  optionIds: string[],
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
    if (selectionModeOf(g) === "MULTIPLE") {
      if (chosen.length === 0 && g.required) {
        return { ok: false, error: `Choose at least one option for "${g.name}".` };
      }
      for (const c of chosen) {
        total += c.priceAddon;
        selections.push({
          groupId: g.id,
          groupName: g.name,
          optionId: c.id,
          optionName: c.name,
          addon: c.priceAddon,
        });
        wanted.delete(c.id);
      }
      continue;
    }
    // SINGLE — pre-existing radio behaviour, unchanged.
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

export function configSnapshot(
  resolution: Extract<ConfigResolution, { ok: true }>,
): ProductConfigSnapshot {
  return {
    kind: "options",
    optionIds: resolution.selections.map((s) => s.optionId),
    selections: resolution.selections,
  };
}

// ── Self-check ───────────────────────────────────────────────────────────────
// npx tsx src/lib/catalog/product-options.ts
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
    {
      id: "g3",
      name: "Disabled group",
      required: true,
      enabled: false,
      options: [],
    },
  ];
  const base = 1000000;

  const good = resolveConfiguredPrice(groups, base, ["o2", "o4"]);
  console.assert(
    good.ok && good.unitPrice === 1365000 && good.selections.length === 2,
    "good path",
  );

  const missing = resolveConfiguredPrice(groups, base, ["o4"]);
  console.assert(!missing.ok, "missing required");

  const stale = resolveConfiguredPrice(groups, base, ["o2", "o3"]);
  console.assert(!stale.ok, "disabled option rejected");

  const dupe = resolveConfiguredPrice(groups, base, ["o1", "o1"]);
  console.assert(!dupe.ok, "duplicate rejected");

  const optionalSkipped = resolveConfiguredPrice(groups, base, ["o1"]);
  console.assert(
    optionalSkipped.ok && optionalSkipped.unitPrice === base,
    "optional skipped",
  );

  console.assert(
    defaultOptionId(groups[0]) === "o1",
    "default = first zero-addon option",
  );
  console.assert(
    defaultOptionId(groups[1]) === "o4",
    "default falls back to only option",
  );

  // MULTIPLE groups: zero-or-more, summed add-ons.
  const multi: OptionGroupLike[] = [
    {
      id: "g4",
      name: "Accessories",
      selectionMode: "MULTIPLE",
      required: false,
      enabled: true,
      options: [
        { id: "o5", name: "Carrying Case", priceAddon: 50000, enabled: true },
        { id: "o6", name: "Coiled Cable", priceAddon: 80000, enabled: true },
        { id: "o7", name: "Wrist Rest", priceAddon: 60000, enabled: true },
      ],
    },
  ];
  const multiRes = resolveConfiguredPrice(multi, 849900, ["o5", "o6"]);
  console.assert(
    multiRes.ok &&
      multiRes.unitPrice === 979900 &&
      multiRes.selections.length === 2,
    "multiple: selections summed",
  );
  const multiNone = resolveConfiguredPrice(multi, 849900, []);
  console.assert(
    multiNone.ok && multiNone.unitPrice === 849900,
    "multiple: optional group allows zero selections",
  );
  const multiRequired = resolveConfiguredPrice(
    [{ ...multi[0], required: true }],
    849900,
    [],
  );
  console.assert(!multiRequired.ok, "multiple: required group needs a selection");
  const singleMultiError = resolveConfiguredPrice(groups, base, ["o1", "o2"]);
  console.assert(!singleMultiError.ok, "single: two selections rejected");

  console.log("product-options self-check passed");
}
