/**
 * Service pricing — SINGLE SOURCE OF TRUTH.
 *
 * Used by: /services live preview (client), /checkout preview (client),
 * order creation API (authoritative server recalculation).
 *
 * The server MUST recalculate every amount from service IDs + quantities
 * loaded fresh from the database. Client values are display-only hints;
 * they are never persisted or charged.
 */

export type ServiceUnit = "PER_SWITCH" | "PER_STABILIZER" | "FLAT" | "QUOTE";
export type ServiceDevice = "KEYBOARD" | "MOUSE" | "OTHER";

export type ServiceConfig = {
  id: string;
  slug: string;
  name: string;
  device: ServiceDevice;
  unit: ServiceUnit;
  price: number | null; // paise
  priceMin: number | null;
  priceMax: number | null;
  priceLabel: string | null;
  groupSlug: string;
};

export type ServicePricingInput = {
  service: ServiceConfig;
  quantity: number;
};

export type ServicePricingResult = {
  serviceId: string;
  serviceName: string;
  slug: string;
  unit: ServiceUnit;
  quantity: number;
  unitPrice: number | null; // paise; null for quote/range lines
  lineTotal: number | null; // paise; null for quote/range lines
  priceText: string;
  isQuote: boolean;
};

export type PricingSummary = {
  lines: ServicePricingResult[];
  subtotal: number; // payable subtotal (quote/range lines excluded)
  hasQuotes: boolean;
};

/** Device configuration captured by the configurator — the only thing sent to the server. */
export type ServiceOrderConfigInput = {
  deviceType: "KEYBOARD" | "MOUSE";
  brand: string;
  model: string;
  layout?: string | null;
  switchModel?: string | null;
  switchQuantity: number;
  stabilizerQuantity: number;
  keycapsIncluded: boolean;
  serviceIds: string[];
};

/** Full order math derived ONLY from DB-loaded services + the config quantities. */
export type ServiceOrderTotals = PricingSummary & {
  shipping: number; // paise
  total: number; // paise — the only chargeable amount
  selectedCount: number;
};

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

/** Unit suffix for a per-unit service ("₹9/SW"). */
export function getServiceUnitLabel(service: ServiceConfig): string {
  if (service.priceLabel) return service.priceLabel;
  if (service.unit === "PER_STABILIZER") return "/EA";
  if (service.unit === "PER_SWITCH") return "/SW";
  return "";
}

/** Quantity a service is multiplied by for the given device configuration. */
export function quantityForService(service: ServiceConfig, cfg: Pick<ServiceOrderConfigInput, "switchQuantity" | "stabilizerQuantity">): number {
  if (service.unit === "PER_SWITCH") return Math.max(1, cfg.switchQuantity);
  if (service.unit === "PER_STABILIZER") return Math.max(1, cfg.stabilizerQuantity);
  return 1;
}

/**
 * Price one line. Quote and min/max-range services never produce an amount —
 * they stay pending until the owner quotes them after inspection.
 */
export function calculateServicePrice(
  service: ServiceConfig,
  quantity: number
): ServicePricingResult {
  const isQuote =
    service.unit === "QUOTE" ||
    (!service.price && service.priceMin == null) ||
    (service.priceMin != null && service.priceMax != null);

  let unitPrice: number | null = null;
  let lineTotal: number | null = null;
  let priceText: string;

  if (isQuote) {
    if (service.priceMin != null && service.priceMax != null) {
      priceText = `₹${formatPaise(service.priceMin)}–${formatPaise(service.priceMax)}`;
    } else {
      priceText = "Quote";
    }
  } else if (service.unit === "PER_SWITCH" || service.unit === "PER_STABILIZER") {
    unitPrice = service.price ?? 0;
    lineTotal = unitPrice * quantity;
    priceText = `₹${formatPaise(unitPrice)}${getServiceUnitLabel(service)}`;
  } else {
    // FLAT
    unitPrice = service.price ?? 0;
    lineTotal = unitPrice;
    priceText = `₹${formatPaise(unitPrice)}`;
  }

  return {
    serviceId: service.id,
    serviceName: service.name,
    slug: service.slug,
    unit: service.unit,
    quantity,
    unitPrice,
    lineTotal,
    priceText,
    isQuote,
  };
}

/** Calculate pricing for a set of services with explicit per-service quantities. */
export function calculateServicesPricing(
  services: ServiceConfig[],
  quantities: Record<string, number>
): PricingSummary {
  const lines: ServicePricingResult[] = [];
  let subtotal = 0;
  let hasQuotes = false;

  for (const service of services) {
    const quantity = quantities[service.id] ?? 1;
    const result = calculateServicePrice(service, quantity);
    lines.push(result);
    if (result.lineTotal !== null) {
      subtotal += result.lineTotal;
    }
    if (result.isQuote) {
      hasQuotes = true;
    }
  }

  return { lines, subtotal, hasQuotes };
}

/**
 * Authoritative order math: services + device config → lines, subtotal,
 * chargeable total. Shipping is NOT included — it is calculated separately
 * once the device physically arrives. Runs identically on client (preview)
 * and server (order creation); the server run is the one that counts.
 */
export function calculateServiceOrder(
  services: ServiceConfig[],
  cfg: ServiceOrderConfigInput
): ServiceOrderTotals {
  const quantities: Record<string, number> = {};
  for (const s of services) {
    quantities[s.id] = quantityForService(s, cfg);
  }
  const base = calculateServicesPricing(services, quantities);
  return {
    ...base,
    shipping: 0,
    total: base.subtotal,
    selectedCount: services.length,
  };
}

/** Format paise to an INR string without the ₹ glyph (for compact panels). */
export function formatINR(paise: number): string {
  return formatPaise(paise);
}
