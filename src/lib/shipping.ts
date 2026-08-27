/**
 * Delhivery rate calculation (kinko v1 charges API).
 * SERVER-ONLY — imports read the token from env; never ship to the browser.
 */

import { createHash } from "crypto";
import { formatINR } from "./money";

const BASE_URL = process.env.DELHIVERY_API_URL ?? "https://staging-express.delhivery.com";
const ORIGIN_PINCODE = process.env.DELHIVERY_ORIGIN_PINCODE ?? "";

export const PAYMENT_MODES = ["Pre-paid", "COD"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** Delhivery `md` values: Surface (S) and Express (E). */
export const SHIPPING_MODES = ["surface", "express"] as const;
export type ShippingMode = (typeof SHIPPING_MODES)[number];

function envMode(v: string | undefined): ShippingMode | null {
  if (v === "E" || v === "e") return "express";
  if (v === "S" || v === "s") return "surface";
  return null;
}

/** Default checkout mode, configurable via DELHIVERY_DEFAULT_MODE ("E"/"S"). */
export const DEFAULT_SHIPPING_MODE: ShippingMode = envMode(process.env.DELHIVERY_DEFAULT_MODE) ?? "express";

/** Modes offered in the UI, via DELHIVERY_MODES (comma list of E/S). Unset → only the default mode. */
export function enabledShippingModes(): ShippingMode[] {
  const raw = process.env.DELHIVERY_MODES;
  if (!raw) return [DEFAULT_SHIPPING_MODE];
  const modes = raw
    .split(",")
    .map((s) => envMode(s.trim()))
    .filter((m): m is ShippingMode => m !== null);
  return modes.length ? Array.from(new Set(modes)) : [DEFAULT_SHIPPING_MODE];
}

/**
 * Display-only delivery-day estimates per mode. The kinko charges endpoint
 * returns no ETD field, so these are storefront estimates (env-overridable),
 * clearly not provider data.
 */
export function estimatedDaysFor(mode: ShippingMode): number {
  const raw = mode === "surface" ? process.env.DELHIVERY_SURFACE_DAYS : process.env.DELHIVERY_EXPRESS_DAYS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : mode === "surface" ? 5 : 2;
}

/** Free-shipping subtotal threshold in PAISE (env value is rupees). Unset/0/invalid → disabled. */
export function freeShippingThresholdPaise(): number | null {
  const n = Number(process.env.FREE_SHIPPING_THRESHOLD);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export function isValidPincode(v: unknown): v is string {
  return typeof v === "string" && /^[1-9]\d{5}$/.test(v);
}

export function toPaymentMode(v: unknown): PaymentMode | null {
  return typeof v === "string" && (PAYMENT_MODES as readonly string[]).includes(v) ? (v as PaymentMode) : null;
}

export function toShippingMode(v: unknown): ShippingMode | null {
  return typeof v === "string" && (SHIPPING_MODES as readonly string[]).includes(v) ? (v as ShippingMode) : null;
}

// ── Weight ───────────────────────────────────────────────────────────────────

/**
 * Total actual weight for a cart, grams — qty × per-line weight.
 * Returns null when ANY line lacks a weight: quoting with a guessed weight
 * would misprice real orders, so callers must surface a configuration error
 * instead. No silent fallback (see MISSING_SHIPPING_CONFIGURATION).
 */
export function cartWeightGrams(items: { quantity: number; variantWeight?: number | null; weight?: number | null }[]): number | null {
  let total = 0;
  for (const it of items) {
    const w = it.variantWeight ?? it.weight;
    if (w == null || w <= 0) return null;
    total += it.quantity * w;
  }
  return items.length > 0 ? Math.max(1, Math.ceil(total)) : null;
}

/** Delhivery chargeable-weight rule: max(actual, volumetric); volumetric kg = L·W·H(cm)/5000. */
export const VOLUMETRIC_DIVISOR_CM3_PER_KG = 5000;

/**
 * Package volumetric weight in grams from summed per-item volumes at the
 * Delhivery standard divisor. Null when any dimension is missing — dimensions
 * are optional and only refine the chargeable weight when complete for every
 * line.
 */
export function calculateVolumetricWeight(
  items: { quantity: number; lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null }[],
): number | null {
  let cm3 = 0;
  for (const it of items) {
    const { lengthCm, widthCm, heightCm } = it;
    if (!lengthCm || !widthCm || !heightCm || lengthCm <= 0 || widthCm <= 0 || heightCm <= 0) return null;
    cm3 += it.quantity * lengthCm * widthCm * heightCm;
  }
  return Math.max(1, Math.ceil(cm3 / (VOLUMETRIC_DIVISOR_CM3_PER_KG / 1000))); // 5000 cm³/kg == 5 cm³/g
}

/**
 * Chargeable weight sent to Delhivery: heavier of actual and volumetric
 * (when all dimensions are present). Throws MISSING_SHIPPING_CONFIGURATION
 * when any product weight is unset — callers map that to the taxonomy code.
 */
export function chargeableWeightGrams(
  items: {
    quantity: number;
    weight?: number | null;
    variantWeight?: number | null;
    lengthCm?: number | null;
    widthCm?: number | null;
    heightCm?: number | null;
  }[],
): { weightGrams: number; volumetricGrams: number | null } {
  const actual = cartWeightGrams(items);
  if (actual === null) throw new Error("MISSING_SHIPPING_CONFIGURATION");
  const volumetric = calculateVolumetricWeight(items);
  return { weightGrams: volumetric !== null ? Math.max(actual, volumetric) : actual, volumetricGrams: volumetric };
}

// ── Free shipping ────────────────────────────────────────────────────────────

/**
 * Server-side free-shipping rule. Two independent paths:
 *  - every line flagged free-shipping in the catalog (per-product rule), OR
 *  - subtotal >= FREE_SHIPPING_THRESHOLD (store-wide rule).
 * Callers must skip provider calls entirely when this returns true.
 */
export function isFreeShipping(opts: { items: { freeShipping: boolean }[]; subtotalPaise: number }): boolean {
  const allFree = opts.items.length > 0 && opts.items.every((i) => i.freeShipping);
  if (allFree) return true;
  const threshold = freeShippingThresholdPaise();
  return threshold !== null && opts.subtotalPaise >= threshold;
}

// ── Delhivery response types ─────────────────────────────────────────────────

export interface DelhiveryChargeItem {
  request_status?: string;
  reason?: string;
  status?: string; // serviceability verdict on shape-B objects — NOT a failure signal
  zone?: string;
  charge_weight?: string | number;
  freight_charge?: string | number;
  cod_charge?: string | number;
  charge_DL?: string | number;
  total_amount?: string | number;
  [key: string]: unknown;
}

// ── Our internal quote ───────────────────────────────────────────────────────

/**
 * Normalized provider quote. amountPaise is INTEGER PAISE (Delhivery reports
 * rupees — exactly one ×100 happens in the parser).
 */
export type ShippingQuote = {
  amountPaise: number;
  currency: "INR";
  mode: ShippingMode;
  weightGrams: number;
  originPincode: string;
  destinationPincode: string;
  zone?: string;
  estimatedDays?: number;
  provider: "delhivery";
  /** Which response field the amount came from — distinguishes all-in totals from base freight. */
  amountBasis: "total_amount" | "freight_charge" | "charge_DL";
};

/**
 * Stable error codes surfaced to API clients. Raw Delhivery statuses/bodies
 * stay in SERVER LOGS ONLY — never in these messages.
 */
export type ShippingErrorCode =
  | "INVALID_CREDENTIALS" // 401/403 from Delhivery — token invalid/expired/wrong env
  | "PINCODE_UNAVAILABLE" // 404 or explicit not-serviceable payload for the destination
  | "RATE_LIMITED" // 429
  | "UPSTREAM_ERROR" // 5xx, timeout, network, unparseable response
  | "EMPTY_CART"
  | "INVALID_PINCODE"
  | "MISSING_SHIPPING_CONFIGURATION" // product(s) missing shipping weight in the catalog
  | "NOT_CONFIGURED"; // missing DELHIVERY_API_TOKEN / DELHIVERY_ORIGIN_PINCODE

/** Customer-safe messages keyed by taxonomy code. */
export const SHIPPING_ERROR_MESSAGES: Record<ShippingErrorCode, string> = {
  INVALID_CREDENTIALS: "Shipping service is temporarily unavailable. Please try again later.",
  PINCODE_UNAVAILABLE: "Shipping unavailable for this pincode.",
  RATE_LIMITED: "Shipping service is temporarily busy. Please try again.",
  UPSTREAM_ERROR: "Unable to calculate shipping right now.",
  EMPTY_CART: "Your cart is empty.",
  INVALID_PINCODE: "Please enter a valid 6-digit pincode.",
  MISSING_SHIPPING_CONFIGURATION: "Shipping information is unavailable for one or more products.",
  NOT_CONFIGURED: "Shipping is not configured.",
};

export type ShippingResult =
  | { ok: true; quote: ShippingQuote; fromCache: boolean }
  | { ok: false; errorCode: ShippingErrorCode; message: string };

interface CacheEntry {
  quote: ShippingQuote;
  expiresAt: number;
}
const CACHE_TTL_MS = 10 * 60 * 1000;
// ponytail: single-process in-memory cache; move to Redis if we ever run multi-instance
const cache = new Map<string, CacheEntry>();

function cacheKey(oPin: string, dPin: string, cgm: number, pt: string, md: ShippingMode) {
  return `${oPin}|${dPin}|${cgm}|${pt}|${md}`;
}

/**
 * Fingerprint of everything a quote depends on (destination, mode, weight,
 * subtotal, exact cart lines). The calculate route returns it and the payment
 * route recomputes it — a mismatch means cart/pin/mode changed after quoting
 * and the fresh recalculation at order time is authoritative.
 */
export function quoteFingerprint(input: {
  destinationPincode: string;
  mode: ShippingMode;
  weightGrams: number;
  subtotalPaise: number;
  itemKeys: string[];
}): string {
  const h = createHash("sha256");
  h.update(
    [input.destinationPincode, input.mode, input.weightGrams, input.subtotalPaise, [...input.itemKeys].sort().join(",")].join("|"),
  );
  return h.digest("hex").slice(0, 24);
}

export function calculateShippingParams(opts: {
  destinationPincode: string;
  paymentMode: PaymentMode;
  weightGrams: number;
  mode?: ShippingMode;
  /** Reverse-leg quotes (pickup: customer→workshop) swap the pins. Defaults to DELHIVERY_ORIGIN_PINCODE. */
  originPincode?: string;
}) {
  const oPin = opts.originPincode && isValidPincode(opts.originPincode) ? opts.originPincode : ORIGIN_PINCODE;
  const cgm = Math.max(1, Math.ceil(opts.weightGrams));
  const md = opts.mode === "surface" ? "S" : "E";
  const params = new URLSearchParams({
    md,
    ss: "Delivered",
    d_pin: opts.destinationPincode,
    o_pin: oPin,
    cgm: String(cgm),
    pt: opts.paymentMode,
  });
  const mode: ShippingMode = md === "S" ? "surface" : "express";
  return { cgm, mode, path: `/api/kinko/v1/invoice/charges/.json?${params.toString()}` };
}

function buildQuote(
  amountPaise: number,
  basis: ShippingQuote["amountBasis"],
  ctx: { destinationPincode: string; mode: ShippingMode; weightGrams: number },
  zone?: string,
): ShippingResult {
  const quote: ShippingQuote = {
    amountPaise,
    currency: "INR",
    mode: ctx.mode,
    weightGrams: ctx.weightGrams,
    originPincode: ORIGIN_PINCODE,
    destinationPincode: ctx.destinationPincode,
    ...(zone ? { zone } : {}),
    provider: "delhivery",
    amountBasis: basis,
  };
  console.log(
    `[shipping] quote success provider=delhivery amount=${amountPaise} currency=INR mode=${ctx.mode} weight=${ctx.weightGrams}g basis=${basis}`,
  );
  return { ok: true, quote, fromCache: false };
}

/**
 * Pure classifier for Delhivery kinko v1 charges responses — maps the HTTP
 * status AND the response-body shape to a quote or a stable error code.
 * Exported so the self-check can regression-test exact production payloads
 * offline. Raw statuses/bodies are logged SERVER-SIDE ONLY.
 *
 * Known success shapes (amounts are RUPEES):
 *   A) [{ request_status: "success", total_amount: "160", cod_charge?: ... }]
 *      total_amount is the all-in payable figure (freight + surcharges + GST).
 *   B) { status: "Delivered", zone: "D", charge_DL: 142, charge_RTO: 0, ... }
 *   B') [{ status: "Delivered", zone: "D", charge_DL: 142, ... }] — array-wrapped
 *      variant observed in production. The serviceability "status" field does
 *      NOT mean unavailability; any valid charge-bearing payload means SUCCESS.
 *
 * Amount policy: prefer total_amount (all-in) → freight_charge → charge_DL.
 * charge_DL alone is the BASE FREIGHT component — the Delhivery One dashboard
 * adds LM/peak/diesel surcharges + 18% GST that this endpoint does not return,
 * so a charge_DL-based quote may understate the dashboard total. That gap is
 * surfaced via quote.amountBasis instead of inventing a formula.
 */
export function parseShippingResponse(
  destinationPincode: string,
  httpStatus: number,
  bodyText: string,
  ctx: { mode: ShippingMode; weightGrams: number } = { mode: DEFAULT_SHIPPING_MODE, weightGrams: 0 },
): ShippingResult {
  const fail = (errorCode: ShippingErrorCode): ShippingResult => ({
    ok: false,
    errorCode,
    message: SHIPPING_ERROR_MESSAGES[errorCode],
  });

  if (httpStatus < 200 || httpStatus >= 300) {
    console.error(`[shipping] delhivery error status=${httpStatus} destination=${destinationPincode}`, bodyText.slice(0, 300));
    if (httpStatus === 401 || httpStatus === 403) return fail("INVALID_CREDENTIALS");
    if (httpStatus === 404) return fail("PINCODE_UNAVAILABLE");
    if (httpStatus === 429) return fail("RATE_LIMITED");
    return fail("UPSTREAM_ERROR");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    console.error("[shipping] delhivery error non-JSON response:", bodyText.slice(0, 300));
    return fail("UPSTREAM_ERROR");
  }

  const rupees = (v: unknown): number | null => {
    const s = String(v).trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  };

  // Extract a quote from one charges record, or null when it carries no usable charge.
  const fullCtx = { destinationPincode, mode: ctx.mode, weightGrams: ctx.weightGrams };
  const zoneOf = (item: Record<string, unknown>) => (typeof item.zone === "string" && item.zone ? item.zone : undefined);
  const quoteFromItem = (item: Record<string, unknown>): ShippingResult | null => {
    const total = rupees(item.total_amount);
    if (total !== null) return buildQuote(total, "total_amount", fullCtx, zoneOf(item));
    const freight = rupees(item.freight_charge);
    if (freight !== null) return buildQuote(freight, "freight_charge", fullCtx, zoneOf(item));
    const dl = rupees(item.charge_DL);
    if (dl !== null) return buildQuote(dl, "charge_DL", fullCtx, zoneOf(item));
    return null;
  };

  // Explicit failure verdicts only. A missing request_status, a serviceability
  // "status" value, or echoed pincodes must NOT classify as unavailable.
  const isExplicitFail = (item: Record<string, unknown>): boolean => {
    const rs = typeof item.request_status === "string" ? item.request_status.trim().toLowerCase() : "";
    if (rs !== "" && rs !== "success") return true;
    return /not\s?-?\s?serviceab|non\s?-?\s?serviceab|un\s?-?\s?serviceab/i.test(String(item.reason ?? ""));
  };

  // Shapes A / B' — array wrapper (legacy charges format + production object-in-array).
  if (Array.isArray(parsed)) {
    if (parsed.length > 0 && parsed[0] && typeof parsed[0] === "object") {
      const item = parsed[0] as Record<string, unknown>;
      // A charge-bearing item wins even when request_status is absent/mismatched.
      if (!isExplicitFail(item)) {
        const q = quoteFromItem(item);
        if (q) return q;
      }
      console.error(`[shipping] delhivery failure payload for ${destinationPincode}:`, JSON.stringify(parsed).slice(0, 200));
      return fail("PINCODE_UNAVAILABLE");
    }
    console.error(`[shipping] Empty Delhivery array for ${destinationPincode}`);
    return fail("UPSTREAM_ERROR");
  }

  // Shape B / other objects.
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    if (!isExplicitFail(o)) {
      const q = quoteFromItem(o);
      if (q) return q;
    }
    const detail = JSON.stringify(o);
    console.error(`[shipping] Unexpected Delhivery response for ${destinationPincode}:`, detail.slice(0, 300));
    if (/not\s?-?\s?serviceab|non\s?-?\s?serviceab|un\s?-?\s?serviceab|invalid\s+pin/i.test(detail)) {
      return fail("PINCODE_UNAVAILABLE");
    }
    return fail("UPSTREAM_ERROR");
  }

  console.error(`[shipping] Unusable Delhivery response for ${destinationPincode}:`, String(parsed).slice(0, 200));
  return fail("UPSTREAM_ERROR");
}

/**
 * Fetches the Delhivery shipping charge. Results are cached by
 * origin|destination|weight|payment-mode|mode so identical requests don't
 * re-hit the API.
 */
export async function calculateShipping(opts: {
  destinationPincode: string;
  paymentMode: PaymentMode;
  weightGrams: number;
  mode?: ShippingMode;
  originPincode?: string;
}): Promise<ShippingResult> {
  if (!ORIGIN_PINCODE || !process.env.DELHIVERY_API_TOKEN) {
    console.error("[shipping] DELHIVERY_API_TOKEN / DELHIVERY_ORIGIN_PINCODE not configured");
    return { ok: false, errorCode: "NOT_CONFIGURED", message: SHIPPING_ERROR_MESSAGES.NOT_CONFIGURED };
  }

  const { cgm, mode, path } = calculateShippingParams(opts);
  const oPin = opts.originPincode && isValidPincode(opts.originPincode) ? opts.originPincode : ORIGIN_PINCODE;
  console.log(`[shipping] quote request origin=${oPin} destination=${opts.destinationPincode} weight=${cgm}g mode=${mode}`);
  const key = cacheKey(oPin, opts.destinationPincode, cgm, opts.paymentMode, mode);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return { ok: true, quote: hit.quote, fromCache: true };

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const bodyText = await res.text();
    const result = parseShippingResponse(opts.destinationPincode, res.status, bodyText, { mode, weightGrams: cgm });
    if (result.ok) {
      cache.set(key, { quote: result.quote, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return result;
  } catch (err) {
    // Network failure / timeout — raw error stays in server logs only.
    console.error("[shipping] Delhivery request failed:", err);
    return { ok: false, errorCode: "UPSTREAM_ERROR", message: SHIPPING_ERROR_MESSAGES.UPSTREAM_ERROR };
  }
}

// ── Self-check ───────────────────────────────────────────────────────────────
// npx tsx src/lib/shipping.ts — offline regression matrix for the whole lib.
if (process.argv[1]?.endsWith("shipping.ts")) {
  runSelfCheck();
}

function runSelfCheck() {
  let failed = 0;
  const t = (cond: boolean, tag: string) => {
    if (!cond) {
      console.error(`FAIL: ${tag}`);
      failed++;
      process.exitCode = 1;
    }
  };
  const expectQuote = (r: ShippingResult, paise: number, tag: string) =>
    t(r.ok && r.quote.amountPaise === paise, `${tag} (got ${r.ok ? r.quote.amountPaise : r.errorCode})`);
  const expectError = (r: ShippingResult, code: ShippingErrorCode, tag: string) =>
    t(!r.ok && r.errorCode === code, `${tag} (got ${r.ok ? "quote" : r.errorCode})`);

  // Pin validation (#1, #2)
  t(isValidPincode("500085"), "valid pin");
  t(isValidPincode("053110") === false, "leading zero rejected");
  t(isValidPincode("1234567") === false, "7 digits rejected");
  t(isValidPincode("12345") === false, "5 digits rejected");
  t(isValidPincode("abcdef") === false, "letters rejected");
  t(!isValidPincode("") && !isValidPincode(null), "empty/null rejected");

  // Modes
  t(toPaymentMode("Pre-paid") === "Pre-paid" && toPaymentMode("COD") === "COD", "payment modes");
  t(toPaymentMode("cod") === null, "bad payment mode rejected");
  t(toShippingMode("surface") === "surface" && toShippingMode("express") === "express", "shipping modes accepted");
  t(toShippingMode("S") === null, "raw md letters rejected at API boundary");

  // Weights (#16, #17): no silent fallback anywhere
  t(
    cartWeightGrams([
      { quantity: 2, weight: 1500 },
      { quantity: 2, variantWeight: 200 },
      { quantity: 1, weight: 20 },
    ]) === 3420,
    "multi-item qty-weight sum = 3420",
  );
  t(cartWeightGrams([{ quantity: 3, weight: 1500 }]) === 4500, "quantity > 1 multiplies");
  t(cartWeightGrams([{ quantity: 1 }]) === null, "missing weight → null (config error)");
  t(cartWeightGrams([{ quantity: 1, weight: 0 }]) === null, "zero weight → null");
  t(cartWeightGrams([]) === null, "empty cart → null");

  // Volumetric: 30×20×10cm ×1 → 6000cm³ / 5000 = 1.2kg → 1200g
  t(calculateVolumetricWeight([{ quantity: 1, lengthCm: 30, widthCm: 20, heightCm: 10 }]) === 1200, "volumetric 30x20x10 → 1200g");
  t(calculateVolumetricWeight([{ quantity: 1, lengthCm: 30 }]) === null, "partial dims → no volumetric");
  t(chargeableWeightGrams([{ quantity: 1, weight: 1500, lengthCm: 30, widthCm: 20, heightCm: 10 }]).weightGrams === 1500, "chargeable max(actual, vol)");
  t(
    chargeableWeightGrams([{ quantity: 1, weight: 900, lengthCm: 40, widthCm: 40, heightCm: 40 }]).weightGrams === 12800,
    "chargeable picks volumetric when heavier",
  );

  // Free shipping (#5, #25): per-product rule OR threshold rule
  t(isFreeShipping({ items: [{ freeShipping: true }, { freeShipping: true }], subtotalPaise: 100 }) === true, "all-free products");
  t(isFreeShipping({ items: [{ freeShipping: false }], subtotalPaise: 100 }) === false, "non-free product below threshold");
  process.env.FREE_SHIPPING_THRESHOLD = "2000";
  t(freeShippingThresholdPaise() === 200000, "threshold env parsed as paise");
  t(isFreeShipping({ items: [{ freeShipping: false }], subtotalPaise: 200000 }) === true, "subtotal == threshold → free");
  t(isFreeShipping({ items: [{ freeShipping: false }], subtotalPaise: 199999 }) === false, "below threshold → paid");
  delete process.env.FREE_SHIPPING_THRESHOLD;

  // Params: actual weight reaches the URL; modes map to md (#3)
  const pE = calculateShippingParams({ destinationPincode: "500085", paymentMode: "Pre-paid", weightGrams: 1920, mode: "express" });
  const pS = calculateShippingParams({ destinationPincode: "500085", paymentMode: "Pre-paid", weightGrams: 1920, mode: "surface" });
  t(pE.cgm === 1920 && pE.path.includes("cgm=1920"), "actual cart weight in cgm");
  t(pE.path.includes("md=E") && pS.path.includes("md=S"), "express/surface md mapping");
  t(pE.path.includes("pt=Pre-paid") && pE.path.includes("d_pin=500085") && pE.path.includes("o_pin=" + ORIGIN_PINCODE), "pt/d_pin/o_pin params");

  // ── Parser regression matrix (#6, #15, §31/§32) ────────────────────────────
  // The exact production payload from §32 — array-wrapped object with a
  // serviceability status field and charge_DL. MUST parse as a ₹142 quote.
  const PROD_500085 =
    '[{"status":"Delivered","zone":"D","charge_DL":142,"charge_RTO":0,"charge_FS":0,"charge_CNC":0,"charge_AWB":0,"charge_RO":0,"charge_FOD":0}]';
  const q142 = parseShippingResponse("500085", 200, PROD_500085);
  expectQuote(q142, 14200, "§32 production payload → ₹142 quote");
  t(q142.ok && q142.quote.amountBasis === "charge_DL", "basis=charge_DL documented");
  t(q142.ok && q142.quote.zone === "D", "zone captured");
  t(q142.ok && q142.quote.provider === "delhivery" && q142.ok && q142.quote.currency === "INR", "normalized fields");

  // Unit contract: rupee 142 lands as exactly 14200 paise — never 1420000 —
  // and renders through the shared formatter without re-scaling.
  {
    const amountPaise: number | null = q142.ok ? q142.quote.amountPaise : null;
    const doubleConverted: number = 1420000; // widened so TS can't fold this away
    t(amountPaise !== null && amountPaise === 14200 && amountPaise !== doubleConverted, "single ×100 conversion");
    t(amountPaise !== null && formatINR(amountPaise) === "₹142", "display ₹142");
    const totalPaise = 18999 + (amountPaise ?? 0); // subtotal stays in paise
    t(totalPaise === 33199 && formatINR(totalPaise) === "₹331.99", "total math stays in paise");
  }

  expectQuote(
    parseShippingResponse("110001", 200, JSON.stringify([{ request_status: "success", total_amount: "160" }])),
    16000,
    "shape A all-in total_amount",
  );
  {
    const rA = parseShippingResponse("110001", 200, JSON.stringify([{ request_status: "success", total_amount: "160" }]));
    t(rA.ok && rA.quote.amountBasis === "total_amount", "all-in basis recorded");
  }
  // total_amount preferred over charge_DL when both exist (no double counting).
  expectQuote(
    parseShippingResponse("110092", 200, JSON.stringify([{ status: "Delivered", total_amount: "190.63", charge_DL: 150 }])),
    19063,
    "total_amount preferred over charge_DL",
  );
  expectQuote(parseShippingResponse("110092", 200, JSON.stringify({ status: "Delivered", freight_charge: "75.5" })), 7550, "freight fallback");
  expectQuote(parseShippingResponse("110092", 200, JSON.stringify({ request_status: "", total_amount: "42" })), 4200, "empty request_status not a fail");
  // Genuine unavailability still classifies correctly (#14)…
  expectError(
    parseShippingResponse("431601", 200, JSON.stringify([{ request_status: "fail", reason: "Pincode not serviceable by Delhivery Express" }])),
    "PINCODE_UNAVAILABLE",
    "explicit fail → unavailable",
  );
  expectError(parseShippingResponse("431601", 200, JSON.stringify([{ request_status: "Fail", total_amount: "" }])), "PINCODE_UNAVAILABLE", "fail verdict wins over blank charges");
  expectError(parseShippingResponse("x", 200, JSON.stringify({ error: "Not Serviceable" })), "PINCODE_UNAVAILABLE", "explicit not-serviceable object");
  // …but pincode echoes / status strings must NOT (#10, §32).
  expectError(
    parseShippingResponse("560001", 200, JSON.stringify({ status: "Delivered", zone: "B", remark: "checked pincode 560001" })),
    "UPSTREAM_ERROR",
    "pincode echo ≠ unavailable",
  );
  expectError(parseShippingResponse("560001", 200, "{}"), "UPSTREAM_ERROR", "no charges, no failure text → upstream");

  // HTTP-status taxonomy (#7–#12)
  expectError(parseShippingResponse("x", 401, '{"detail":"Invalid token"}'), "INVALID_CREDENTIALS", "401 → credentials");
  expectError(parseShippingResponse("x", 403, '{"detail":"Forbidden"}'), "INVALID_CREDENTIALS", "403 → credentials");
  expectError(parseShippingResponse("x", 404, '{"detail":"Not Found"}'), "PINCODE_UNAVAILABLE", "404 → unavailable");
  expectError(parseShippingResponse("x", 429, "{}"), "RATE_LIMITED", "429 → rate limited");
  expectError(parseShippingResponse("x", 500, "{}"), "UPSTREAM_ERROR", "500 → upstream");
  expectError(parseShippingResponse("x", 502, "{}"), "UPSTREAM_ERROR", "502 → upstream");
  expectError(parseShippingResponse("x", 200, "<html>gateway timeout</html>"), "UPSTREAM_ERROR", "non-JSON → upstream");
  expectError(parseShippingResponse("x", 200, ""), "UPSTREAM_ERROR", "empty body → upstream");
  expectError(parseShippingResponse("x", 200, '"just a string"'), "UPSTREAM_ERROR", "scalar JSON → upstream");
  expectError(parseShippingResponse("x", 200, "[]"), "UPSTREAM_ERROR", "empty array → upstream");
  // Timeout/network path lives in calculateShipping's catch — same UPSTREAM_ERROR contract.

  // Quote fingerprint (#20, #21): any input change invalidates.
  const base = { destinationPincode: "500085", mode: "surface" as ShippingMode, weightGrams: 1500, subtotalPaise: 18999, itemKeys: ["p1"] };
  const fp = quoteFingerprint(base);
  t(fp === quoteFingerprint({ ...base }), "fingerprint stable for identical inputs");
  t(fp !== quoteFingerprint({ ...base, itemKeys: ["p1", "p2"] }), "cart change invalidates fingerprint");
  t(fp !== quoteFingerprint({ ...base, destinationPincode: "560001" }), "pin change invalidates fingerprint");
  t(fp !== quoteFingerprint({ ...base, mode: "express" }), "mode change invalidates fingerprint");
  t(fp !== quoteFingerprint({ ...base, weightGrams: 3440 }), "weight change invalidates fingerprint");

  if (failed === 0) console.log(`shipping self-check passed`);
}
