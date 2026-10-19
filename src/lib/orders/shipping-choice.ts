/**
 * Admin-facing reader for the customer's chosen shipping method.
 *
 * Where the choice lives differs per order type:
 *   - SERVICE (mods): `Order.summary.modsShipping.method` is the pickup-vs-ship
 *     choice ("customer_shipping" | "pickup" | "undecided") and `.mode` the
 *     Delhivery speed. `Order.shippingMode` holds only the speed.
 *   - REPAIR: `Order.summary.shippingMethod` ("SHIP" | "PICKUP" | "UNSURE"),
 *     written by the repair intake action.
 *   - PRODUCT: only the server-derived speed in `Order.shippingMode`.
 *
 * Pure and dependency-free so both server components and the client shipping
 * panel can label the raw stored values. Every parser is fail-closed: an
 * unrecognized shape yields `null`/no rows rather than a guessed label.
 */

export const MODS_SHIPPING_METHODS = [
  "customer_shipping",
  "pickup",
  "undecided",
] as const;
export type ModsShippingMethod = (typeof MODS_SHIPPING_METHODS)[number];

export const REPAIR_SHIPPING_METHODS = ["SHIP", "PICKUP", "UNSURE"] as const;
export type RepairShippingMethod = (typeof REPAIR_SHIPPING_METHODS)[number];

/** Admin wording for the mods pickup-vs-ship choice (customer-facing copy differs). */
export function modsShippingMethodLabel(method: unknown): string {
  switch (method) {
    case "customer_shipping":
      return "Customer ships device";
    case "pickup":
      return "Pickup by KeebForge";
    case "undecided":
      return "To be decided";
    default:
      return "Unknown";
  }
}

/** Admin wording for the repair intake choice. */
export function repairShippingMethodLabel(method: unknown): string {
  switch (method) {
    case "SHIP":
      return "Customer ships device";
    case "PICKUP":
      return "Pickup requested";
    case "UNSURE":
      return "Not sure yet";
    default:
      return "Unknown";
  }
}

/**
 * Human label for a Delhivery speed. Values may be stored capitalized
 * ("Surface"/"Express") or lowercase, so the match is case-insensitive.
 */
export function shippingSpeedLabel(mode: unknown): string {
  if (typeof mode !== "string" || mode.trim() === "") return "";
  const m = mode.trim().toLowerCase();
  if (m === "surface") return "Surface";
  if (m === "express") return "Express";
  return mode.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ModsShippingChoice = {
  method: ModsShippingMethod;
  mode: string | null;
};

/** Read `Order.summary.modsShipping` (SERVICE orders). */
export function parseModsShipping(summary: unknown): ModsShippingChoice | null {
  if (!isRecord(summary)) return null;
  const raw = summary.modsShipping;
  if (!isRecord(raw)) return null;
  const method = raw.method;
  if (
    typeof method !== "string" ||
    !(MODS_SHIPPING_METHODS as readonly string[]).includes(method)
  ) {
    return null;
  }
  return {
    method: method as ModsShippingMethod,
    mode: typeof raw.mode === "string" && raw.mode.trim() !== "" ? raw.mode : null,
  };
}

/** Read `Order.summary.shippingMethod` (REPAIR orders). */
export function parseRepairShipping(summary: unknown): RepairShippingMethod | null {
  if (!isRecord(summary)) return null;
  const method = summary.shippingMethod;
  if (
    typeof method === "string" &&
    (REPAIR_SHIPPING_METHODS as readonly string[]).includes(method)
  ) {
    return method as RepairShippingMethod;
  }
  return null;
}

export type ShippingChoiceRow = { label: string; value: string };

/**
 * Rows for the admin Delivery card describing the customer's pickup-vs-ship
 * choice, keyed off the stored order shape. Returns [] when nothing is
 * recorded (PRODUCT orders, legacy repair orders, undecided). Delivery *speed*
 * is not repeated here — `ShippingPanel` already renders the order's mode.
 */
export function shippingChoiceRows(order: {
  type: string;
  summary: unknown;
}): ShippingChoiceRow[] {
  if (order.type === "SERVICE") {
    const mods = parseModsShipping(order.summary);
    return mods
      ? [{ label: "How device reaches us", value: modsShippingMethodLabel(mods.method) }]
      : [];
  }

  if (order.type === "REPAIR") {
    const method = parseRepairShipping(order.summary);
    return method
      ? [{ label: "How device reaches us", value: repairShippingMethodLabel(method) }]
      : [];
  }

  return [];
}
