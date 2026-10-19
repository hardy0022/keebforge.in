/**
 * Read-only view over `OrderItem.variantInfo`.
 *
 * `create-order` snapshots configurable-product selections into
 * `OrderItem.variantInfo` in one of two shapes (`ProductConfigSnapshot` for
 * option groups, `{ id, name, options }` for a `ProductVariant`), but older or
 * hand-edited rows can carry anything. This parser is deliberately fail-closed:
 * it returns `null` for every unrecognized shape, so a display caller can never
 * crash or invent a selection from malformed JSON.
 *
 * Pure and dependency-free (safe from server components and tests).
 */

import type { ResolvedOption } from "@/lib/catalog/product-options";

export type VariantViewOption = { key: string; value: string };

export type OrderItemVariantView =
  | { kind: "options"; selections: ResolvedOption[] }
  | { kind: "variant"; name: string; options: VariantViewOption[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSelection(entry: unknown): ResolvedOption | null {
  if (!isRecord(entry)) return null;
  const { groupId, groupName, optionId, optionName, addon } = entry;
  if (typeof groupName !== "string" || typeof optionName !== "string") {
    return null;
  }
  return {
    groupId: typeof groupId === "string" ? groupId : "",
    groupName,
    optionId: typeof optionId === "string" ? optionId : "",
    optionName,
    addon: typeof addon === "number" && Number.isFinite(addon) ? addon : 0,
  };
}

function parseVariantOptions(raw: unknown): VariantViewOption[] {
  if (!isRecord(raw)) return [];
  const out: VariantViewOption[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" || typeof value === "number") {
      out.push({ key, value: String(value) });
    }
  }
  return out;
}

export function parseVariantInfo(raw: unknown): OrderItemVariantView | null {
  if (!isRecord(raw)) return null;

  if (raw.kind === "options") {
    if (!Array.isArray(raw.selections)) return null;
    const selections = raw.selections
      .map(parseSelection)
      .filter((s): s is ResolvedOption => s !== null);
    return selections.length > 0 ? { kind: "options", selections } : null;
  }

  if (typeof raw.name === "string" && raw.name.trim() !== "") {
    return {
      kind: "variant",
      name: raw.name,
      options: parseVariantOptions(raw.options),
    };
  }

  return null;
}
