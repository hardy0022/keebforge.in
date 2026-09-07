/**
 * Delhivery rate calculation (kinko v1 charges API).
 * SERVER-ONLY — imports read the token from env; never ship to the browser.
 */

import { createHash } from "crypto";
import { formatINR } from "@/lib/utils/money";

const BASE_URL =
  process.env.DELHIVERY_API_URL ?? "https://staging-express.delhivery.com";
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
export const DEFAULT_SHIPPING_MODE: ShippingMode =
  envMode(process.env.DELHIVERY_DEFAULT_MODE) ?? "express";

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
  const raw =
    mode === "surface"
      ? process.env.DELHIVERY_SURFACE_DAYS
      : process.env.DELHIVERY_EXPRESS_DAYS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0
    ? Math.round(n)
    : mode === "surface"
      ? 5
      : 2;
}

/** Free-shipping subtotal threshold in PAISE (env value is rupees). Unset/0/invalid → disabled. */
export function freeShippingThresholdPaise(): number | null {
  const n = Number(process.env.FREE_SHIPPING_THRESHOLD);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export function isValidPincode(v: unknown): v is string {
  return typeof v === "string" && /^[1-9]\d{5}$/.test(v);
}

/** Delhivery waybills are numeric, 10–20 digits. */
export function trackWaybillValid(v: unknown): v is string {
  return typeof v === "string" && /^\d{10,20}$/.test(v.trim());
}

export function toPaymentMode(v: unknown): PaymentMode | null {
  return typeof v === "string" &&
    (PAYMENT_MODES as readonly string[]).includes(v)
    ? (v as PaymentMode)
    : null;
}

export function toShippingMode(v: unknown): ShippingMode | null {
  return typeof v === "string" &&
    (SHIPPING_MODES as readonly string[]).includes(v)
    ? (v as ShippingMode)
    : null;
}

// ── Weight ───────────────────────────────────────────────────────────────────

/**
 * Total actual weight for a cart, grams — qty × per-line weight.
 * Returns null when ANY line lacks a weight: quoting with a guessed weight
 * would misprice real orders, so callers must surface a configuration error
 * instead. No silent fallback (see MISSING_SHIPPING_CONFIGURATION).
 */
export function cartWeightGrams(
  items: {
    quantity: number;
    variantWeight?: number | null;
    weight?: number | null;
  }[],
): number | null {
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
  items: {
    quantity: number;
    lengthCm?: number | null;
    widthCm?: number | null;
    heightCm?: number | null;
  }[],
): number | null {
  let cm3 = 0;
  for (const it of items) {
    const { lengthCm, widthCm, heightCm } = it;
    if (
      !lengthCm ||
      !widthCm ||
      !heightCm ||
      lengthCm <= 0 ||
      widthCm <= 0 ||
      heightCm <= 0
    )
      return null;
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
  return {
    weightGrams: volumetric !== null ? Math.max(actual, volumetric) : actual,
    volumetricGrams: volumetric,
  };
}

// ── Free shipping ────────────────────────────────────────────────────────────

/**
 * Server-side free-shipping rule. Two independent paths:
 *  - every line flagged free-shipping in the catalog (per-product rule), OR
 *  - subtotal >= FREE_SHIPPING_THRESHOLD (store-wide rule).
 * Callers must skip provider calls entirely when this returns true.
 */
export function isFreeShipping(opts: {
  items: { freeShipping: boolean }[];
  subtotalPaise: number;
}): boolean {
  const allFree =
    opts.items.length > 0 && opts.items.every((i) => i.freeShipping);
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
  INVALID_CREDENTIALS:
    "Shipping service is temporarily unavailable. Please try again later.",
  PINCODE_UNAVAILABLE: "Shipping unavailable for this pincode.",
  RATE_LIMITED: "Shipping service is temporarily busy. Please try again.",
  UPSTREAM_ERROR: "Unable to calculate shipping right now.",
  EMPTY_CART: "Your cart is empty.",
  INVALID_PINCODE: "Please enter a valid 6-digit pincode.",
  MISSING_SHIPPING_CONFIGURATION:
    "Shipping information is unavailable for one or more products.",
  NOT_CONFIGURED: "Shipping is not configured.",
};

export type ShippingResult =
  | { ok: true; quote: ShippingQuote; fromCache: boolean }
  | { ok: false; errorCode: ShippingErrorCode; message: string };

// ── Live waybill tracking (packages json API) ───────────────────────────────

/** One normalized Delhivery scan event, oldest-first ordering applied by caller. */
export type TrackingScan = {
  location: string;
  status: string;
  instructions: string;
  scannedAt: string | null;
};

export type TrackingData = {
  awb: string;
  status: string;
  statusDateTime: string | null;
  destination: string;
  scans: TrackingScan[];
};

export type TrackingResult =
  | { ok: true; data: TrackingData }
  | { ok: false; errorCode: ShippingErrorCode; message: string };

/** Pure classifier for the packages json tracking response. Exported for the self-check. */
export function parseTrackingResponse(
  httpStatus: number,
  bodyText: string,
): TrackingResult {
  const fail = (errorCode: ShippingErrorCode): TrackingResult => ({
    ok: false,
    errorCode,
    message: SHIPPING_ERROR_MESSAGES[errorCode],
  });

  if (httpStatus < 200 || httpStatus >= 300) {
    console.error(
      `[tracking] delhivery error status=${httpStatus}`,
      bodyText.slice(0, 300),
    );
    if (httpStatus === 401 || httpStatus === 403)
      return fail("INVALID_CREDENTIALS");
    if (httpStatus === 429) return fail("RATE_LIMITED");
    return fail("UPSTREAM_ERROR");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    console.error("[tracking] non-JSON response:", bodyText.slice(0, 300));
    return fail("UPSTREAM_ERROR");
  }

  const rec = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const ship = rec(parsed).ShipmentData;
  const first =
    arr(ship)[0] && typeof arr(ship)[0] === "object" ? rec(arr(ship)[0]) : null;
  if (!first) {
    console.error(
      "[tracking] no ShipmentData for waybill:",
      bodyText.slice(0, 300),
    );
    return fail("UPSTREAM_ERROR");
  }

  const scans: TrackingScan[] = arr(first.Scans)
    .map((s) => {
      const o = rec(s);
      const d = rec(o.ScanDetail);
      return {
        location: str(o.Location) ?? str(d.ScannedLocation) ?? "",
        status: str(o.Status) ?? str(o.Scan) ?? str(d.ScanType) ?? "",
        instructions: str(o.Instructions) ?? str(d.Instructions) ?? "",
        scannedAt: str(d.ScanDateTime) ?? str(o.StatusDateTime) ?? null,
      };
    })
    .filter((sc) => sc.status || sc.location || sc.instructions);

  // The shipment-level `Status` is coarse ("In Transit" for the whole journey).
  // The latest scan's event text is the accurate current status (e.g. "Manifest
  // uploaded at Akhnoor_Galali_D (Jammu & Kashmir)") — prefer it.
  const liveStatus = [...scans].reverse().find((sc) => sc.status)?.status;
  const liveAt = [...scans].reverse().find((sc) => sc.scannedAt)?.scannedAt;

  return {
    ok: true,
    data: {
      awb: str(first.AWB) ?? "",
      status: liveStatus ?? str(first.Status) ?? "",
      statusDateTime: liveAt ?? str(first.StatusDateTime) ?? null,
      destination: str(first.Destination) ?? str(first.StatusLocation) ?? "",
      scans,
    },
  };
}

/**
 * Fetches live Delhivery scan data for a waybill (shipment tracking number).
 * Uses the same base URL + token as the charges API. Lazy: no caching — each
 * customer track request is a fresh look at reality.
 */
export async function trackShipment(waybill: string): Promise<TrackingResult> {
  if (!process.env.DELHIVERY_API_TOKEN) {
    console.error("[tracking] DELHIVERY_API_TOKEN not configured");
    return {
      ok: false,
      errorCode: "NOT_CONFIGURED",
      message: SHIPPING_ERROR_MESSAGES.NOT_CONFIGURED,
    };
  }
  if (!trackWaybillValid(waybill)) {
    return {
      ok: false,
      errorCode: "INVALID_PINCODE",
      message: SHIPPING_ERROR_MESSAGES.INVALID_PINCODE,
    };
  }

  try {
    const url = `${BASE_URL}/api/v1/packages/json/?waybill=${encodeURIComponent(waybill)}&ref_ids=`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    const bodyText = await res.text();
    return parseTrackingResponse(res.status, bodyText);
  } catch (err) {
    console.error("[tracking] Delhivery request failed:", err);
    return {
      ok: false,
      errorCode: "UPSTREAM_ERROR",
      message: SHIPPING_ERROR_MESSAGES.UPSTREAM_ERROR,
    };
  }
}

// ── Bulk waybill fetch (admin) ──────────────────────────────────────────────
// https://staging-express.delhivery.com/waybill/api/bulk/json/?count=N

export type WaybillsResult =
  | { ok: true; waybills: string[] }
  | { ok: false; errorCode: ShippingErrorCode; message: string };

function wbFail(errorCode: ShippingErrorCode): WaybillsResult {
  return { ok: false, errorCode, message: SHIPPING_ERROR_MESSAGES[errorCode] };
}

/** Pure parser for the bulk waybill response: { waybills: ["...", ...] }. */
export function parseBulkWaybills(
  httpStatus: number,
  bodyText: string,
): WaybillsResult {
  if (httpStatus < 200 || httpStatus >= 300) {
    console.error(
      `[waybill] delhivery error status=${httpStatus}`,
      bodyText.slice(0, 300),
    );
    if (httpStatus === 401 || httpStatus === 403)
      return wbFail("INVALID_CREDENTIALS");
    if (httpStatus === 429) return wbFail("RATE_LIMITED");
    return wbFail("UPSTREAM_ERROR");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    console.error("[waybill] non-JSON response:", bodyText.slice(0, 300));
    return wbFail("UPSTREAM_ERROR");
  }
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const waybills = arr((parsed as Record<string, unknown>)?.waybills)
    .filter((w): w is string => typeof w === "string" && w.trim() !== "")
    .map((w) => w.trim());
  return waybills.length ? { ok: true, waybills } : wbFail("UPSTREAM_ERROR");
}

// ── Expected TAT (admin) ──────────────────────────────────────────────────────
// Delhivery `mot`: E = Express, S = Surface (same code set as shipping `md`).

export type ExpectedTatResult =
  | { ok: true; mot: "E" | "S"; tat: string | null; days: number | null }
  | { ok: false; errorCode: ShippingErrorCode; message: string };

function tatFail(errorCode: ShippingErrorCode): ExpectedTatResult {
  return { ok: false, errorCode, message: SHIPPING_ERROR_MESSAGES[errorCode] };
}

/** Pure parser for /api/dc/expected_tat — pulls the numeric day TAT when present. */
export function parseExpectedTat(
  httpStatus: number,
  bodyText: string,
  mot: "E" | "S",
): ExpectedTatResult {
  if (httpStatus < 200 || httpStatus >= 300) {
    console.error(
      `[tat] delhivery error status=${httpStatus}`,
      bodyText.slice(0, 300),
    );
    if (httpStatus === 401 || httpStatus === 403)
      return tatFail("INVALID_CREDENTIALS");
    if (httpStatus === 429) return tatFail("RATE_LIMITED");
    return tatFail("UPSTREAM_ERROR");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    console.error("[tat] non-JSON response:", bodyText.slice(0, 300));
    return tatFail("UPSTREAM_ERROR");
  }
  const rec = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const o = rec(parsed);
  const raw = o.tat ?? o.TAT ?? o.tat_d2d ?? o.D2D;
  const days =
    typeof raw === "number"
      ? raw
      : Number(String(raw ?? "").replace(/[^\d.]/g, ""));
  return {
    ok: true,
    mot,
    tat: typeof raw === "string" ? raw : raw != null ? String(raw) : null,
    days: Number.isFinite(days) && days > 0 ? days : null,
  };
}

interface CacheEntry {
  quote: ShippingQuote;
  expiresAt: number;
}
const CACHE_TTL_MS = 10 * 60 * 1000;
// ponytail: single-process in-memory cache; move to Redis if we ever run multi-instance
const cache = new Map<string, CacheEntry>();

function cacheKey(
  oPin: string,
  dPin: string,
  cgm: number,
  pt: string,
  md: ShippingMode,
) {
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
    [
      input.destinationPincode,
      input.mode,
      input.weightGrams,
      input.subtotalPaise,
      [...input.itemKeys].sort().join(","),
    ].join("|"),
  );
  return h.digest("hex").slice(0, 24);
}

/** Delhivery Quote Service Level (`ss`) for the charges invoice. */
export const QUOTE_TYPES = ["forward", "rto", "dto"] as const;
export type QuoteType = (typeof QUOTE_TYPES)[number];

/** Map our quote-type to Delhivery's `ss` (sub-service) value. */
export function ssValueFor(type: QuoteType): string {
  return type === "rto" ? "RTO" : type === "dto" ? "DTO" : "Delivered";
}

export function calculateShippingParams(opts: {
  destinationPincode: string;
  paymentMode: PaymentMode;
  weightGrams: number;
  mode?: ShippingMode;
  /** Reverse-leg quotes (pickup: customer→workshop) swap the pins. Defaults to DELHIVERY_ORIGIN_PINCODE. */
  originPincode?: string;
  /** Quote Service Level. Default forward (ss=Delivered). */
  quoteType?: QuoteType;
  /** COD indicator param. Defaults to paymentMode === "COD". */
  cod?: boolean;
}) {
  const oPin =
    opts.originPincode && isValidPincode(opts.originPincode)
      ? opts.originPincode
      : ORIGIN_PINCODE;
  const cgm = Math.max(1, Math.ceil(opts.weightGrams));
  const md = opts.mode === "surface" ? "S" : "E";
  const params = new URLSearchParams({
    md,
    ss: ssValueFor(opts.quoteType ?? "forward"),
    d_pin: opts.destinationPincode,
    o_pin: oPin,
    cgm: String(cgm),
    pt: opts.paymentMode,
    cod: (() => {
      const c = opts.cod ?? opts.paymentMode === "COD";
      return c ? "1" : "0";
    })(),
  });
  const mode: ShippingMode = md === "S" ? "surface" : "express";
  return {
    cgm,
    mode,
    path: `/api/kinko/v1/invoice/charges/.json?${params.toString()}`,
  };
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
  ctx: { mode: ShippingMode; weightGrams: number } = {
    mode: DEFAULT_SHIPPING_MODE,
    weightGrams: 0,
  },
): ShippingResult {
  const fail = (errorCode: ShippingErrorCode): ShippingResult => ({
    ok: false,
    errorCode,
    message: SHIPPING_ERROR_MESSAGES[errorCode],
  });

  if (httpStatus < 200 || httpStatus >= 300) {
    console.error(
      `[shipping] delhivery error status=${httpStatus} destination=${destinationPincode}`,
      bodyText.slice(0, 300),
    );
    if (httpStatus === 401 || httpStatus === 403)
      return fail("INVALID_CREDENTIALS");
    if (httpStatus === 404) return fail("PINCODE_UNAVAILABLE");
    if (httpStatus === 429) return fail("RATE_LIMITED");
    return fail("UPSTREAM_ERROR");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    console.error(
      "[shipping] delhivery error non-JSON response:",
      bodyText.slice(0, 300),
    );
    return fail("UPSTREAM_ERROR");
  }

  const rupees = (v: unknown): number | null => {
    const s = String(v).trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  };

  // Extract a quote from one charges record, or null when it carries no usable charge.
  const fullCtx = {
    destinationPincode,
    mode: ctx.mode,
    weightGrams: ctx.weightGrams,
  };
  const zoneOf = (item: Record<string, unknown>) =>
    typeof item.zone === "string" && item.zone ? item.zone : undefined;
  const quoteFromItem = (
    item: Record<string, unknown>,
  ): ShippingResult | null => {
    const total = rupees(item.total_amount);
    if (total !== null)
      return buildQuote(total, "total_amount", fullCtx, zoneOf(item));
    const freight = rupees(item.freight_charge);
    if (freight !== null)
      return buildQuote(freight, "freight_charge", fullCtx, zoneOf(item));
    const dl = rupees(item.charge_DL);
    if (dl !== null) return buildQuote(dl, "charge_DL", fullCtx, zoneOf(item));
    return null;
  };

  // Explicit failure verdicts only. A missing request_status, a serviceability
  // "status" value, or echoed pincodes must NOT classify as unavailable.
  const isExplicitFail = (item: Record<string, unknown>): boolean => {
    const rs =
      typeof item.request_status === "string"
        ? item.request_status.trim().toLowerCase()
        : "";
    if (rs !== "" && rs !== "success") return true;
    return /not\s?-?\s?serviceab|non\s?-?\s?serviceab|un\s?-?\s?serviceab/i.test(
      String(item.reason ?? ""),
    );
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
      console.error(
        `[shipping] delhivery failure payload for ${destinationPincode}:`,
        JSON.stringify(parsed).slice(0, 200),
      );
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
    console.error(
      `[shipping] Unexpected Delhivery response for ${destinationPincode}:`,
      detail.slice(0, 300),
    );
    if (
      /not\s?-?\s?serviceab|non\s?-?\s?serviceab|un\s?-?\s?serviceab|invalid\s+pin/i.test(
        detail,
      )
    ) {
      return fail("PINCODE_UNAVAILABLE");
    }
    return fail("UPSTREAM_ERROR");
  }

  console.error(
    `[shipping] Unusable Delhivery response for ${destinationPincode}:`,
    String(parsed).slice(0, 200),
  );
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
    console.error(
      "[shipping] DELHIVERY_API_TOKEN / DELHIVERY_ORIGIN_PINCODE not configured",
    );
    return {
      ok: false,
      errorCode: "NOT_CONFIGURED",
      message: SHIPPING_ERROR_MESSAGES.NOT_CONFIGURED,
    };
  }

  const { cgm, mode, path } = calculateShippingParams(opts);
  const oPin =
    opts.originPincode && isValidPincode(opts.originPincode)
      ? opts.originPincode
      : ORIGIN_PINCODE;
  console.log(
    `[shipping] quote request origin=${oPin} destination=${opts.destinationPincode} weight=${cgm}g mode=${mode}`,
  );
  const key = cacheKey(
    oPin,
    opts.destinationPincode,
    cgm,
    opts.paymentMode,
    mode,
  );
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now())
    return { ok: true, quote: hit.quote, fromCache: true };

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    const bodyText = await res.text();
    const result = parseShippingResponse(
      opts.destinationPincode,
      res.status,
      bodyText,
      { mode, weightGrams: cgm },
    );
    if (result.ok) {
      cache.set(key, {
        quote: result.quote,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    }
    return result;
  } catch (err) {
    // Network failure / timeout — raw error stays in server logs only.
    console.error("[shipping] Delhivery request failed:", err);
    return {
      ok: false,
      errorCode: "UPSTREAM_ERROR",
      message: SHIPPING_ERROR_MESSAGES.UPSTREAM_ERROR,
    };
  }
}

// ── Shipment creation (cmu create.json) ─────────────────────────────────────

export type CreateShipmentInput = {
  consignee: {
    name: string;
    address: string;
    pin: string;
    city: string;
    state: string;
    country: string;
    phone: string;
  };
  order: string;
  sellerInv: string;
  totalRupees: string;
  paymentMode: "Prepaid" | "COD";
  codAmountRupees?: string;
  productsDesc: string;
  quantity: number;
  weightGrams: number;
  shipmentLengthCm: number;
  shipmentWidthCm: number;
  shipmentHeightCm: number;
  shippingMode: string;
  pickup: {
    name: string;
    add: string;
    city: string;
    pin_code: string;
    country: string;
    phone: string;
    returnAdd?: string;
    returnPin?: string;
    returnCity?: string;
    returnState?: string;
    returnCountry?: string;
  };
};

export type CreateShipmentResult =
  | { ok: true; waybill: string }
  | { ok: false; errorCode: ShippingErrorCode; message: string };

function createFail(errorCode: ShippingErrorCode): CreateShipmentResult {
  return { ok: false, errorCode, message: SHIPPING_ERROR_MESSAGES[errorCode] };
}

/**
 * Builds the `format=json&data={...}` request body for Delhivery's
 * cmu/create.json manifestation API. The pickup_location pin comes from
 * DELHIVERY_ORIGIN_PINCODE (or DELHIVERY_PICKUP_PIN). Special chars forbidden
 * by Delhivery (&, #, %, ;, \) are stripped.
 */
export function buildCreateShipmentBody(input: CreateShipmentInput): string {
  const clean = (s: string) => s.replace(/[&#%;\\]/g, "");
  const shipment = {
    name: clean(input.consignee.name),
    add: clean(input.consignee.address),
    pin: input.consignee.pin,
    city: clean(input.consignee.city),
    state: clean(input.consignee.state),
    country: clean(input.consignee.country),
    phone: input.consignee.phone.replace(/[^\d]/g, "").slice(0, 15),
    order: clean(input.order),
    payment_mode: input.paymentMode,
    return_pin: clean(input.pickup.returnPin ?? ""),
    return_city: clean(input.pickup.returnCity ?? ""),
    return_phone: (input.pickup.phone ?? "").replace(/[^\d]/g, "").slice(0, 15),
    return_add: clean(input.pickup.returnAdd ?? ""),
    return_state: clean(input.pickup.returnState ?? ""),
    return_country: clean(
      input.pickup.returnCountry ?? input.pickup.country ?? "India",
    ),
    products_desc: clean(input.productsDesc),
    hsn_code: "",
    cod_amount:
      input.paymentMode === "COD" ? (input.codAmountRupees ?? "0") : "0",
    order_date: new Date().toISOString(),
    total_amount: input.totalRupees,
    seller_add: clean(input.pickup.add),
    seller_name: clean(input.pickup.name),
    seller_inv: clean(input.sellerInv),
    quantity: String(input.quantity),
    waybill: "",
    shipment_length: String(input.shipmentLengthCm),
    shipment_width: String(input.shipmentWidthCm),
    shipment_height: String(input.shipmentHeightCm),
    weight: `${input.weightGrams} gm`,
    seller_gst_tin: "",
    shipping_mode: input.shippingMode,
    address_type: "home",
  };
  const payload = {
    shipments: [shipment],
    pickup_location: {
      name: clean(input.pickup.name),
      add: clean(input.pickup.add),
      city: clean(input.pickup.city),
      pin_code: input.pickup.pin_code,
      country: clean(input.pickup.country ?? "India"),
      phone: (input.pickup.phone ?? "").replace(/[^\d]/g, "").slice(0, 15),
    },
  };
  return `format=json&data=${JSON.stringify(payload)}`;
}

/** Extracts the generated waybill from a cmu create.json response. Pure + exported for self-check. */
export function parseCreateShipmentResponse(
  httpStatus: number,
  bodyText: string,
): CreateShipmentResult {
  if (httpStatus < 200 || httpStatus >= 300) {
    console.error(
      `[shipment] delhivery cmu error status=${httpStatus}`,
      bodyText.slice(0, 300),
    );
    if (httpStatus === 401 || httpStatus === 403)
      return createFail("INVALID_CREDENTIALS");
    if (httpStatus === 429) return createFail("RATE_LIMITED");
    return createFail("UPSTREAM_ERROR");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    console.error("[shipment] cmu non-JSON response:", bodyText.slice(0, 300));
    return createFail("UPSTREAM_ERROR");
  }
  const rec = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  // Waybills appear either in `packages[].waybill` (successful manifest) or
  // `shipments[].waybill`.
  for (const s of arr(rec(parsed).packages).concat(
    arr(rec(parsed).shipments),
  )) {
    const wb = str(rec(s).waybill);
    if (wb) return { ok: true, waybill: wb };
  }
  // No waybill — surface Delhivery's own rmk ("Package might be saved… quote
  // this error…") instead of a generic message, so the operator can act.
  const rmk = str(rec(parsed).rmk);
  console.error(
    "[shipment] cmu response without waybill:",
    bodyText.slice(0, 300),
  );
  return {
    ok: false,
    errorCode: "UPSTREAM_ERROR",
    message: rmk || SHIPPING_ERROR_MESSAGES.UPSTREAM_ERROR,
  };
}

/**
 * Manifests a shipment with Delhivery (cmu/create.json). Returns the waybill.
 * Skips the storefront cache — a manifest is a one-shot side effect.
 */
export async function createShipment(
  input: CreateShipmentInput,
): Promise<CreateShipmentResult> {
  if (!process.env.DELHIVERY_API_TOKEN) {
    console.error("[shipment] DELHIVERY_API_TOKEN not configured");
    return createFail("NOT_CONFIGURED");
  }
  if (!input.pickup.pin_code) {
    console.error(
      "[shipment] no pickup pincode (DELHIVERY_PICKUP_PIN / DELHIVERY_ORIGIN_PINCODE)",
    );
    return createFail("NOT_CONFIGURED");
  }
  try {
    const res = await fetch(`${BASE_URL}/api/cmu/create.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`,
      },
      // Delhivery reads `format` + `data` as URL-encoded form fields (not JSON).
      // buildCreateShipmentBody's clean() already strips chars that would break
      // form parsing, so the raw `format=json&data=...` string goes straight in.
      body: buildCreateShipmentBody(input),
      signal: AbortSignal.timeout(15_000),
    });
    const bodyText = await res.text();
    return parseCreateShipmentResponse(res.status, bodyText);
  } catch (err) {
    console.error("[shipment] Delhivery cmu request failed:", err);
    return createFail("UPSTREAM_ERROR");
  }
}

// ── Shipment edit / cancel (p/edit) ──────────────────────────────────────────
// POST /api/p/edit — adjusts weight/dimensions/COD of a manifested waybill, or
// cancels it (`cancellation: "true"`). Same endpoint, different payloads.

export type EditShipmentInput = {
  waybill: string;
  pt?: PaymentMode;
  cod?: number; // ₹ — only meaningful when pt is COD
  gm?: number; // grams (may be fractional)
  shipmentLengthCm?: number;
  shipmentWidthCm?: number;
  shipmentHeightCm?: number;
};

export type EditShipmentResult =
  { ok: true } | { ok: false; errorCode: ShippingErrorCode; message: string };

function editFail(errorCode: ShippingErrorCode): EditShipmentResult {
  return {
    ok: false,
    errorCode,
    message: SHIPPING_ERROR_MESSAGES[errorCode],
  };
}

/** Builds the JSON body for /api/p/edit. Exported for the self-check. */
export function buildEditShipmentBody(input: EditShipmentInput): string {
  const body: Record<string, unknown> = { waybill: input.waybill };
  if (input.pt) body.pt = input.pt;
  if (input.cod !== undefined) body.cod = input.cod;
  if (input.gm !== undefined) body.gm = input.gm;
  if (input.shipmentHeightCm !== undefined)
    body.shipment_height = input.shipmentHeightCm;
  if (input.shipmentWidthCm !== undefined)
    body.shipment_width = input.shipmentWidthCm;
  if (input.shipmentLengthCm !== undefined)
    body.shipment_length = input.shipmentLengthCm;
  return JSON.stringify(body);
}

/** Builds the /api/p/edit cancellation payload. Exported for the self-check. */
export function buildCancelShipmentBody(waybill: string): string {
  return JSON.stringify({ waybill, cancellation: "true" });
}

/**
 * Pure classifier for /api/p/edit responses (edit + cancel share the endpoint).
 * An explicit `success:false` / `error:true` flag is a refusal whose remark is
 * surfaced to the operator; any other 200 JSON is treated as processed (the
 * endpoint returns 4xx for bad waybills, so a 200 without an error flag is the
 * success signal).
 */
export function parseEditShipmentResponse(
  httpStatus: number,
  bodyText: string,
): EditShipmentResult {
  if (httpStatus < 200 || httpStatus >= 300) {
    console.error(
      `[shipment] delhivery p/edit error status=${httpStatus}`,
      bodyText.slice(0, 300),
    );
    if (httpStatus === 401 || httpStatus === 403)
      return editFail("INVALID_CREDENTIALS");
    if (httpStatus === 429) return editFail("RATE_LIMITED");
    return editFail("UPSTREAM_ERROR");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    console.error(
      "[shipment] p/edit non-JSON response:",
      bodyText.slice(0, 300),
    );
    return editFail("UPSTREAM_ERROR");
  }
  const rec = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const o = rec(parsed);

  const refused =
    o.success === false ||
    o.error === true ||
    o.error === "true" ||
    String(o.success ?? "").toLowerCase() === "false";
  if (refused) {
    const msg =
      (typeof o.remark === "string" && o.remark.trim()) ||
      (typeof o.error_message === "string" && o.error_message.trim()) ||
      (typeof o.error === "string" && o.error.trim()) ||
      "Delhivery rejected the shipment change.";
    console.error(
      "[shipment] delhivery p/edit refusal:",
      bodyText.slice(0, 300),
    );
    return { ok: false, errorCode: "UPSTREAM_ERROR", message: msg };
  }
  return { ok: true };
}

/**
 * Updates an existing manifested shipment's weight, dimensions, and COD amount
 * via /api/p/edit. One-shot side effect, no caching.
 */
export async function editShipment(
  input: EditShipmentInput,
): Promise<EditShipmentResult> {
  if (!process.env.DELHIVERY_API_TOKEN) {
    console.error("[shipment] DELHIVERY_API_TOKEN not configured");
    return editFail("NOT_CONFIGURED");
  }
  if (!trackWaybillValid(input.waybill)) {
    console.error("[shipment] invalid waybill for p/edit:", input.waybill);
    return editFail("UPSTREAM_ERROR");
  }
  try {
    const res = await fetch(`${BASE_URL}/api/p/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`,
      },
      body: buildEditShipmentBody(input),
      signal: AbortSignal.timeout(15_000),
    });
    return parseEditShipmentResponse(res.status, await res.text());
  } catch (err) {
    console.error("[shipment] Delhivery p/edit request failed:", err);
    return editFail("UPSTREAM_ERROR");
  }
}

/**
 * Cancels a manifested waybill via /api/p/edit (cancellation: "true").
 * The caller clears the local shipment row so the order can be re-manifested.
 */
export async function cancelShipment(
  waybill: string,
): Promise<EditShipmentResult> {
  if (!process.env.DELHIVERY_API_TOKEN) {
    console.error("[shipment] DELHIVERY_API_TOKEN not configured");
    return editFail("NOT_CONFIGURED");
  }
  if (!trackWaybillValid(waybill)) {
    console.error("[shipment] invalid waybill for cancellation:", waybill);
    return editFail("UPSTREAM_ERROR");
  }
  try {
    const res = await fetch(`${BASE_URL}/api/p/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`,
      },
      body: buildCancelShipmentBody(waybill),
      signal: AbortSignal.timeout(15_000),
    });
    return parseEditShipmentResponse(res.status, await res.text());
  } catch (err) {
    console.error("[shipment] Delhivery cancel request failed:", err);
    return editFail("UPSTREAM_ERROR");
  }
}

// ── Pickup request (admin) ───────────────────────────────────────────────────
// POST /fm/request/new/ — books a courier pickup at the warehouse.

export type PickupRequestResult =
  | { ok: true; pickupId: string | null; raw: string }
  | { ok: false; errorCode: ShippingErrorCode; message: string };

function pickupFail(errorCode: ShippingErrorCode): PickupRequestResult {
  return { ok: false, errorCode, message: SHIPPING_ERROR_MESSAGES[errorCode] };
}

export type BookPickupInput = {
  /** Registered warehouse name (pickup_location.name must match Delhivery). */
  pickupLocation: string;
  /** YYYY-MM-DD */
  pickupDate: string;
  /** HH:MM:SS */
  pickupTime: string;
  expectedPackageCount: number;
};

/** Builds the /fm/request/new/ JSON body. Exported for the self-check. */
export function buildPickupRequestBody(input: BookPickupInput): string {
  return JSON.stringify({
    pickup_time: input.pickupTime,
    pickup_date: input.pickupDate,
    pickup_location: input.pickupLocation,
    expected_package_count: input.expectedPackageCount,
  });
}

/** Pure parser for the fm/request/new/ response — just confirms the pickup was booked. */
export function parsePickupRequest(
  httpStatus: number,
  bodyText: string,
): PickupRequestResult {
  if (httpStatus < 200 || httpStatus >= 300) {
    console.error(
      `[pickup] delhivery error status=${httpStatus}`,
      bodyText.slice(0, 300),
    );
    if (httpStatus === 401 || httpStatus === 403) {
      // Delhivery returns 401 for an unregistered/mismatched pickup-location
      // name TOO, with the reason in the body ("Invalid Pickup Location
      // ClientWarehouse matching query does not exist."). Surface that instead
      // of blaming credentials, or the admin never learns the real cause.
      if (/pickup[_ -]?location|clientwarehouse|invalid pickup/i.test(bodyText)) {
        let msg = "Pickup location isn't registered with Delhivery.";
        try {
          const o = JSON.parse(bodyText) as Record<string, unknown>;
          const v =
            typeof o.pickup_location === "string"
              ? o.pickup_location
              : typeof o.error === "string"
                ? o.error
                : null;
          if (v) msg = v;
        } catch {
          // keep default
        }
        return { ok: false, errorCode: "UPSTREAM_ERROR", message: msg };
      }
      return pickupFail("INVALID_CREDENTIALS");
    }
    if (httpStatus === 429) return pickupFail("RATE_LIMITED");
    if (httpStatus === 400) {
      // Field-level validation errors come back as {"field": "reason"} — surface
      // the reason (e.g. "Pickup time cannot be in past") instead of a generic line.
      let msg = "Could not book pickup.";
      try {
        const o = JSON.parse(bodyText) as unknown;
        if (o && typeof o === "object" && !Array.isArray(o)) {
          const first = Object.values(o as Record<string, unknown>)
            .map((v) => (typeof v === "string" ? v.trim() : ""))
            .find(Boolean);
          if (first) msg = first;
        }
      } catch {
        // keep default message
      }
      return { ok: false, errorCode: "UPSTREAM_ERROR", message: msg };
    }
    return pickupFail("UPSTREAM_ERROR");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    console.error("[pickup] non-JSON response:", bodyText.slice(0, 300));
    return pickupFail("UPSTREAM_ERROR");
  }
  const rec = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const s = rec(parsed);
  if (s.error && String(s.status ?? "").toLowerCase() !== "success") {
    // Some Delhivery error shapes carry "error": true + "remark"/"pickup_error".
    const msg =
      typeof s.remark === "string"
        ? s.remark
        : typeof s.pickup_error === "string"
          ? s.pickup_error
          : "Could not book pickup.";
    console.error("[pickup] delhivery refusal:", bodyText.slice(0, 300));
    return { ok: false, errorCode: "UPSTREAM_ERROR", message: msg };
  }
  const rawId = s.pickup_id ?? s.id;
  const id =
    typeof rawId === "string" && rawId.length > 0
      ? rawId
      : typeof rawId === "number"
        ? String(rawId)
        : null;
  return { ok: true, pickupId: id, raw: bodyText };
}

/**
 * Books a courier pickup at the warehouse via /fm/request/new/. One-shot side
 * effect, no caching.
 */
export async function bookPickup(
  input: BookPickupInput,
): Promise<PickupRequestResult> {
  if (!process.env.DELHIVERY_API_TOKEN) {
    console.error("[pickup] DELHIVERY_API_TOKEN not configured");
    return pickupFail("NOT_CONFIGURED");
  }
  if (!input.pickupLocation) {
    console.error("[pickup] no warehouse name (Settings → Shipping)");
    return pickupFail("NOT_CONFIGURED");
  }
  try {
    const res = await fetch(`${BASE_URL}/fm/request/new/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`,
      },
      body: buildPickupRequestBody(input),
      signal: AbortSignal.timeout(15_000),
    });
    return parsePickupRequest(res.status, await res.text());
  } catch (err) {
    console.error("[pickup] Delhivery request failed:", err);
    return pickupFail("UPSTREAM_ERROR");
  }
}

// ── Client warehouse (pickup location) registration ─────────────────────────
// Delhivery only manifests shipments from warehouses registered in its system.
// The admin Settings page saves the pickup location here and registers it via
// /api/backend/clientwarehouse/create/ so pickup_location.name matches.

/** SiteSetting key holding the admin-configured pickup location (JSON object). */
export const PICKUP_SETTING_KEY = "delhivery_pickup";

export type PickupLocation = {
  name: string;
  address: string;
  city: string;
  pin: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  registeredName: string;
  returnAddress: string;
  returnPin: string;
  returnCity: string;
  returnState: string;
  returnCountry: string;
};

export type WarehouseCreateResult = { ok: boolean; message?: string };

/** Pure parser for the clientwarehouse/create/ response. Exported for self-check. */
export function parseWarehouseResponse(
  httpStatus: number,
  bodyText: string,
): WarehouseCreateResult {
  let rec: Record<string, unknown> = {};
  let parsed = false;
  try {
    rec = JSON.parse(bodyText) as Record<string, unknown>;
    parsed = true;
  } catch {
    rec = {};
  }
  const rmk =
    (typeof rec.rmk === "string" && rec.rmk.trim()) ||
    (typeof rec.error === "string" && rec.error.trim()) ||
    "";
  const bad =
    httpStatus < 200 ||
    httpStatus >= 300 ||
    !parsed ||
    rec.success === false ||
    rec.error === true;
  if (bad) {
    console.error(
      `[warehouse] delhivery error status=${httpStatus}`,
      bodyText.slice(0, 300),
    );
    if (httpStatus === 401 || httpStatus === 403)
      return { ok: false, message: "Invalid Delhivery token." };
    return {
      ok: false,
      message: rmk || "Could not register the warehouse with Delhivery.",
    };
  }
  return { ok: true };
}

/**
 * Registers the pickup warehouse in Delhivery so manifests (createShipment)
 * and pickups can use its name. Idempotent-ish: a name that already exists
 * returns an error — the caller treats "already exist" as success.
 */
export async function createDelhiveryWarehouse(
  input: PickupLocation,
): Promise<WarehouseCreateResult> {
  if (!process.env.DELHIVERY_API_TOKEN) {
    console.error("[warehouse] DELHIVERY_API_TOKEN not configured");
    return { ok: false, message: "DELHIVERY_API_TOKEN not configured." };
  }
  try {
    const res = await fetch(`${BASE_URL}/api/backend/clientwarehouse/create/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone: input.phone,
        city: input.city,
        name: input.name,
        pin: input.pin,
        address: input.address,
        country: input.country,
        email: input.email,
        registered_name: input.registeredName || input.name,
        return_address: input.returnAddress,
        return_pin: input.returnPin,
        return_city: input.returnCity,
        return_state: input.returnState,
        return_country: input.returnCountry,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    return parseWarehouseResponse(res.status, await res.text());
  } catch (err) {
    console.error("[warehouse] Delhivery request failed:", err);
    return { ok: false, message: "Could not reach Delhivery." };
  }
}

/**
 * Updates an existing registered warehouse (name/phone/address) via
 * /api/backend/clientwarehouse/edit/. Used when create reports the warehouse
 * already exists, so address/phone edits still sync through. Name must match
 * the registered warehouse.
 */
export async function editDelhiveryWarehouse(
  input: PickupLocation,
): Promise<WarehouseCreateResult> {
  if (!process.env.DELHIVERY_API_TOKEN) {
    console.error("[warehouse] DELHIVERY_API_TOKEN not configured");
    return { ok: false, message: "DELHIVERY_API_TOKEN not configured." };
  }
  try {
    const res = await fetch(`${BASE_URL}/api/backend/clientwarehouse/edit/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.DELHIVERY_API_TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: input.name,
        phone: input.phone,
        address: input.address,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    return parseWarehouseResponse(res.status, await res.text());
  } catch (err) {
    console.error("[warehouse] Delhivery edit request failed:", err);
    return { ok: false, message: "Could not reach Delhivery." };
  }
}

// ── Self-check ───────────────────────────────────────────────────────────────
// npx tsx src/lib/delhivery/index.ts — offline regression matrix for the whole lib.
if (
  process.argv[1]?.endsWith("shipping/delhivery.ts") ||
  process.argv[1]?.endsWith("shipping/delhivery.js")
) {
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
    t(
      r.ok && r.quote.amountPaise === paise,
      `${tag} (got ${r.ok ? r.quote.amountPaise : r.errorCode})`,
    );
  const expectError = (
    r: ShippingResult,
    code: ShippingErrorCode,
    tag: string,
  ) =>
    t(
      !r.ok && r.errorCode === code,
      `${tag} (got ${r.ok ? "quote" : r.errorCode})`,
    );

  // Pin validation (#1, #2)
  t(isValidPincode("500085"), "valid pin");
  t(isValidPincode("053110") === false, "leading zero rejected");
  t(isValidPincode("1234567") === false, "7 digits rejected");
  t(isValidPincode("12345") === false, "5 digits rejected");
  t(isValidPincode("abcdef") === false, "letters rejected");
  t(!isValidPincode("") && !isValidPincode(null), "empty/null rejected");

  // Modes
  t(
    toPaymentMode("Pre-paid") === "Pre-paid" && toPaymentMode("COD") === "COD",
    "payment modes",
  );
  t(toPaymentMode("cod") === null, "bad payment mode rejected");
  t(
    toShippingMode("surface") === "surface" &&
      toShippingMode("express") === "express",
    "shipping modes accepted",
  );
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
  t(
    cartWeightGrams([{ quantity: 3, weight: 1500 }]) === 4500,
    "quantity > 1 multiplies",
  );
  t(
    cartWeightGrams([{ quantity: 1 }]) === null,
    "missing weight → null (config error)",
  );
  t(
    cartWeightGrams([{ quantity: 1, weight: 0 }]) === null,
    "zero weight → null",
  );
  t(cartWeightGrams([]) === null, "empty cart → null");

  // Volumetric: 30×20×10cm ×1 → 6000cm³ / 5000 = 1.2kg → 1200g
  t(
    calculateVolumetricWeight([
      { quantity: 1, lengthCm: 30, widthCm: 20, heightCm: 10 },
    ]) === 1200,
    "volumetric 30x20x10 → 1200g",
  );
  t(
    calculateVolumetricWeight([{ quantity: 1, lengthCm: 30 }]) === null,
    "partial dims → no volumetric",
  );
  t(
    chargeableWeightGrams([
      { quantity: 1, weight: 1500, lengthCm: 30, widthCm: 20, heightCm: 10 },
    ]).weightGrams === 1500,
    "chargeable max(actual, vol)",
  );
  t(
    chargeableWeightGrams([
      { quantity: 1, weight: 900, lengthCm: 40, widthCm: 40, heightCm: 40 },
    ]).weightGrams === 12800,
    "chargeable picks volumetric when heavier",
  );

  // Free shipping (#5, #25): per-product rule OR threshold rule
  t(
    isFreeShipping({
      items: [{ freeShipping: true }, { freeShipping: true }],
      subtotalPaise: 100,
    }) === true,
    "all-free products",
  );
  t(
    isFreeShipping({ items: [{ freeShipping: false }], subtotalPaise: 100 }) ===
      false,
    "non-free product below threshold",
  );
  process.env.FREE_SHIPPING_THRESHOLD = "2000";
  t(freeShippingThresholdPaise() === 200000, "threshold env parsed as paise");
  t(
    isFreeShipping({
      items: [{ freeShipping: false }],
      subtotalPaise: 200000,
    }) === true,
    "subtotal == threshold → free",
  );
  t(
    isFreeShipping({
      items: [{ freeShipping: false }],
      subtotalPaise: 199999,
    }) === false,
    "below threshold → paid",
  );
  delete process.env.FREE_SHIPPING_THRESHOLD;

  // Params: actual weight reaches the URL; modes map to md (#3)
  const pE = calculateShippingParams({
    destinationPincode: "500085",
    paymentMode: "Pre-paid",
    weightGrams: 1920,
    mode: "express",
  });
  const pS = calculateShippingParams({
    destinationPincode: "500085",
    paymentMode: "Pre-paid",
    weightGrams: 1920,
    mode: "surface",
  });
  t(
    pE.cgm === 1920 && pE.path.includes("cgm=1920"),
    "actual cart weight in cgm",
  );
  t(
    pE.path.includes("md=E") && pS.path.includes("md=S"),
    "express/surface md mapping",
  );
  t(
    pE.path.includes("pt=Pre-paid") &&
      pE.path.includes("d_pin=500085") &&
      pE.path.includes("o_pin=" + ORIGIN_PINCODE),
    "pt/d_pin/o_pin params",
  );

  // Quote types + COD indicator: match Delhivery's ss/cod conventions exactly.
  const prE = calculateShippingParams({
    destinationPincode: "500085",
    paymentMode: "Pre-paid",
    weightGrams: 500,
    mode: "express",
  });
  t(
    prE.path.includes("ss=Delivered") && prE.path.includes("cod=0"),
    "forward → ss=Delivered, cod=0",
  );
  const prRto = calculateShippingParams({
    destinationPincode: "500085",
    paymentMode: "Pre-paid",
    weightGrams: 500,
    mode: "express",
    quoteType: "rto",
    cod: true,
  });
  t(
    prRto.path.includes("ss=RTO") && prRto.path.includes("cod=1"),
    "rto → ss=RTO, cod=1",
  );
  const prDto = calculateShippingParams({
    destinationPincode: "500085",
    paymentMode: "Pre-paid",
    weightGrams: 500,
    mode: "express",
    quoteType: "dto",
  });
  t(
    prDto.path.includes("ss=DTO") && prDto.path.includes("cod=0"),
    "dto → ss=DTO, cod=0",
  );
  const prCod = calculateShippingParams({
    destinationPincode: "500085",
    paymentMode: "COD",
    weightGrams: 500,
    mode: "express",
  });
  t(
    prCod.path.includes("pt=COD") && prCod.path.includes("cod=1"),
    "COD payment → cod=1 by default",
  );

  // ── Parser regression matrix (#6, #15, §31/§32) ────────────────────────────
  // The exact production payload from §32 — array-wrapped object with a
  // serviceability status field and charge_DL. MUST parse as a ₹142 quote.
  const PROD_500085 =
    '[{"status":"Delivered","zone":"D","charge_DL":142,"charge_RTO":0,"charge_FS":0,"charge_CNC":0,"charge_AWB":0,"charge_RO":0,"charge_FOD":0}]';
  const q142 = parseShippingResponse("500085", 200, PROD_500085);
  expectQuote(q142, 14200, "§32 production payload → ₹142 quote");
  t(
    q142.ok && q142.quote.amountBasis === "charge_DL",
    "basis=charge_DL documented",
  );
  t(q142.ok && q142.quote.zone === "D", "zone captured");
  t(
    q142.ok &&
      q142.quote.provider === "delhivery" &&
      q142.ok &&
      q142.quote.currency === "INR",
    "normalized fields",
  );

  // Unit contract: rupee 142 lands as exactly 14200 paise — never 1420000 —
  // and renders through the shared formatter without re-scaling.
  {
    const amountPaise: number | null = q142.ok ? q142.quote.amountPaise : null;
    const doubleConverted: number = 1420000; // widened so TS can't fold this away
    t(
      amountPaise !== null &&
        amountPaise === 14200 &&
        amountPaise !== doubleConverted,
      "single ×100 conversion",
    );
    t(
      amountPaise !== null && formatINR(amountPaise) === "₹142",
      "display ₹142",
    );
    const totalPaise = 18999 + (amountPaise ?? 0); // subtotal stays in paise
    t(
      totalPaise === 33199 && formatINR(totalPaise) === "₹331.99",
      "total math stays in paise",
    );
  }

  expectQuote(
    parseShippingResponse(
      "110001",
      200,
      JSON.stringify([{ request_status: "success", total_amount: "160" }]),
    ),
    16000,
    "shape A all-in total_amount",
  );
  {
    const rA = parseShippingResponse(
      "110001",
      200,
      JSON.stringify([{ request_status: "success", total_amount: "160" }]),
    );
    t(
      rA.ok && rA.quote.amountBasis === "total_amount",
      "all-in basis recorded",
    );
  }
  // total_amount preferred over charge_DL when both exist (no double counting).
  expectQuote(
    parseShippingResponse(
      "110092",
      200,
      JSON.stringify([
        { status: "Delivered", total_amount: "190.63", charge_DL: 150 },
      ]),
    ),
    19063,
    "total_amount preferred over charge_DL",
  );
  expectQuote(
    parseShippingResponse(
      "110092",
      200,
      JSON.stringify({ status: "Delivered", freight_charge: "75.5" }),
    ),
    7550,
    "freight fallback",
  );
  expectQuote(
    parseShippingResponse(
      "110092",
      200,
      JSON.stringify({ request_status: "", total_amount: "42" }),
    ),
    4200,
    "empty request_status not a fail",
  );
  // Genuine unavailability still classifies correctly (#14)…
  expectError(
    parseShippingResponse(
      "431601",
      200,
      JSON.stringify([
        {
          request_status: "fail",
          reason: "Pincode not serviceable by Delhivery Express",
        },
      ]),
    ),
    "PINCODE_UNAVAILABLE",
    "explicit fail → unavailable",
  );
  expectError(
    parseShippingResponse(
      "431601",
      200,
      JSON.stringify([{ request_status: "Fail", total_amount: "" }]),
    ),
    "PINCODE_UNAVAILABLE",
    "fail verdict wins over blank charges",
  );
  expectError(
    parseShippingResponse(
      "x",
      200,
      JSON.stringify({ error: "Not Serviceable" }),
    ),
    "PINCODE_UNAVAILABLE",
    "explicit not-serviceable object",
  );
  // …but pincode echoes / status strings must NOT (#10, §32).
  expectError(
    parseShippingResponse(
      "560001",
      200,
      JSON.stringify({
        status: "Delivered",
        zone: "B",
        remark: "checked pincode 560001",
      }),
    ),
    "UPSTREAM_ERROR",
    "pincode echo ≠ unavailable",
  );
  expectError(
    parseShippingResponse("560001", 200, "{}"),
    "UPSTREAM_ERROR",
    "no charges, no failure text → upstream",
  );

  // HTTP-status taxonomy (#7–#12)
  expectError(
    parseShippingResponse("x", 401, '{"detail":"Invalid token"}'),
    "INVALID_CREDENTIALS",
    "401 → credentials",
  );
  expectError(
    parseShippingResponse("x", 403, '{"detail":"Forbidden"}'),
    "INVALID_CREDENTIALS",
    "403 → credentials",
  );
  expectError(
    parseShippingResponse("x", 404, '{"detail":"Not Found"}'),
    "PINCODE_UNAVAILABLE",
    "404 → unavailable",
  );
  expectError(
    parseShippingResponse("x", 429, "{}"),
    "RATE_LIMITED",
    "429 → rate limited",
  );
  expectError(
    parseShippingResponse("x", 500, "{}"),
    "UPSTREAM_ERROR",
    "500 → upstream",
  );
  expectError(
    parseShippingResponse("x", 502, "{}"),
    "UPSTREAM_ERROR",
    "502 → upstream",
  );
  expectError(
    parseShippingResponse("x", 200, "<html>gateway timeout</html>"),
    "UPSTREAM_ERROR",
    "non-JSON → upstream",
  );
  expectError(
    parseShippingResponse("x", 200, ""),
    "UPSTREAM_ERROR",
    "empty body → upstream",
  );
  expectError(
    parseShippingResponse("x", 200, '"just a string"'),
    "UPSTREAM_ERROR",
    "scalar JSON → upstream",
  );
  expectError(
    parseShippingResponse("x", 200, "[]"),
    "UPSTREAM_ERROR",
    "empty array → upstream",
  );
  // Timeout/network path lives in calculateShipping's catch — same UPSTREAM_ERROR contract.

  // Quote fingerprint (#20, #21): any input change invalidates.
  const base = {
    destinationPincode: "500085",
    mode: "surface" as ShippingMode,
    weightGrams: 1500,
    subtotalPaise: 18999,
    itemKeys: ["p1"],
  };
  const fp = quoteFingerprint(base);
  t(
    fp === quoteFingerprint({ ...base }),
    "fingerprint stable for identical inputs",
  );
  t(
    fp !== quoteFingerprint({ ...base, itemKeys: ["p1", "p2"] }),
    "cart change invalidates fingerprint",
  );
  t(
    fp !== quoteFingerprint({ ...base, destinationPincode: "560001" }),
    "pin change invalidates fingerprint",
  );
  t(
    fp !== quoteFingerprint({ ...base, mode: "express" }),
    "mode change invalidates fingerprint",
  );
  t(
    fp !== quoteFingerprint({ ...base, weightGrams: 3440 }),
    "weight change invalidates fingerprint",
  );

  // ── Tracking parser ────────────────────────────────────────────────────────
  const expectTrackOk = (
    r: TrackingResult,
    expStatus: string,
    scans: number,
    tag: string,
  ) =>
    t(
      r.ok && r.data.status === expStatus && r.data.scans.length === scans,
      `${tag} (got ${r.ok ? r.data.status : r.errorCode} / ${r.ok ? r.data.scans.length : 0})`,
    );
  const expectTrackErr = (
    r: TrackingResult,
    code: ShippingErrorCode,
    tag: string,
  ) =>
    t(
      !r.ok && r.errorCode === code,
      `${tag} (got ${r.ok ? "ok" : r.errorCode})`,
    );

  const TRACK_BODY = JSON.stringify({
    ShipmentData: [
      {
        AWB: "49323510001061",
        Status: "In Transit",
        StatusDateTime: "2026-09-01 04:12:33",
        StatusLocation: "Delhi",
        Destination: "Jammu",
        Scans: [
          {
            ScanDetail: {
              ScanType: "Picked Up",
              ScannedLocation: "Jammu",
              ScanDateTime: "2026-08-30 10:00:00",
              Instructions: "Package picked",
            },
          },
          {
            ScanDetail: {
              ScanType: "In Transit",
              ScannedLocation: "Delhi",
              ScanDateTime: "2026-09-01 04:12:33",
              Instructions: "Reached hub",
            },
          },
        ],
      },
    ],
  });
  expectTrackOk(
    parseTrackingResponse(200, TRACK_BODY),
    "In Transit",
    2,
    "tracking shape: status + scans (oldest-first)",
  );
  {
    // The coarse shipment-level Status ("In Transit") must NOT win over the
    // latest scan's accurate event text (e.g. "Manifest uploaded at …").
    const r = parseTrackingResponse(
      200,
      JSON.stringify({
        ShipmentData: [
          {
            AWB: "49323510001094",
            Status: "In Transit",
            Scans: [
              {
                ScanDetail: {
                  ScanType: "Manifest Uploaded",
                  ScannedLocation: "Akhnoor_Galali_D",
                  ScanDateTime: "2026-09-06 14:02:33",
                },
              },
              {
                Status:
                  "Manifest uploaded at Akhnoor_Galali_D (Jammu & Kashmir)",
                ScanDetail: {
                  ScanType: "Manifest Uploaded",
                  ScannedLocation: "Jammu & Kashmir",
                  ScanDateTime: "2026-09-06 14:05:33",
                },
              },
            ],
          },
        ],
      }),
    );
    t(
      r.ok && /Manifest uploaded at Akhnoor/.test(r.data.status),
      `tracking: latest scan status wins (got ${r.ok ? r.data.status : r.errorCode})`,
    );
    t(
      r.ok && r.data.scans.length === 2,
      "tracking: granular scan status parsed per scan",
    );
  }
  {
    const r = parseTrackingResponse(200, TRACK_BODY);
    t(
      r.ok && r.data.awb === "49323510001061" && r.data.destination === "Jammu",
      "tracking: awb + destination captured",
    );
    t(
      r.ok &&
        r.data.scans[0].location === "Jammu" &&
        r.data.scans[0].status === "Picked Up",
      "tracking: first scan parsed",
    );
  }
  expectTrackErr(
    parseTrackingResponse(200, '{"ShipmentData":[]}'),
    "UPSTREAM_ERROR",
    "tracking: empty ShipmentData → upstream",
  );
  expectTrackErr(
    parseTrackingResponse(200, "<html>err</html>"),
    "UPSTREAM_ERROR",
    "tracking: non-JSON → upstream",
  );
  expectTrackErr(
    parseTrackingResponse(401, '{"detail":"Invalid token"}'),
    "INVALID_CREDENTIALS",
    "tracking: 401 → credentials",
  );
  expectTrackErr(
    parseTrackingResponse(429, "{}"),
    "RATE_LIMITED",
    "tracking: 429 → rate limited",
  );
  t(
    trackWaybillValid("49323510001061") === true &&
      trackWaybillValid("abc123") === false,
    "waybill format gate",
  );
  {
    const rNoScans = parseTrackingResponse(
      200,
      JSON.stringify({
        ShipmentData: [{ AWB: "1", Status: "Delivered", Scans: [] }],
      }),
    );
    t(
      rNoScans.ok &&
        rNoScans.data.scans.length === 0 &&
        rNoScans.data.status === "Delivered",
      "tracking: no-scans delivered still ok",
    );
  }

  // ── Shipment creation payload + response ───────────────────────────────────
  const cmuInput: CreateShipmentInput = {
    consignee: {
      name: "SAKSHITH SHETTY",
      address: "Jeppu Bappal",
      pin: "575002",
      city: "Mangaluru",
      state: "Karnataka",
      country: "India",
      phone: "9008144809",
    },
    order: "151",
    sellerInv: "KFMTIBWV443V9G",
    totalRupees: "999",
    paymentMode: "Prepaid",
    codAmountRupees: "999",
    productsDesc: "keyboard",
    quantity: 1,
    weightGrams: 877,
    shipmentLengthCm: 20,
    shipmentWidthCm: 8,
    shipmentHeightCm: 8,
    shippingMode: "Surface",
    pickup: {
      name: "Hardy",
      add: "Simla",
      city: "",
      pin_code: "",
      country: "India",
      phone: "",
      returnAdd: "Simla R",
      returnPin: "181206",
      returnCity: "Jammu",
      returnState: "J&K",
      returnCountry: "India",
    },
  };
  {
    const body = buildCreateShipmentBody(cmuInput);
    t(body.startsWith("format=json&data="), "cmu: format=json&data= prefix");
    t(
      body.includes('"name":"SAKSHITH SHETTY"') &&
        body.includes('"pin":"575002"'),
      "cmu: consignee fields encoded",
    );
    t(
      body.includes('"shipping_mode":"Surface"') &&
        body.includes('"weight":"877 gm"'),
      "cmu: shipment fields",
    );
    t(
      body.includes('"shipment_length":"20"') &&
        body.includes('"shipment_width":"8"'),
      "cmu: all three dimensions sent",
    );
    t(
      body.includes('"return_pin":"181206"') &&
        body.includes('"return_add":"Simla R"') &&
        body.includes('"return_country":"India"'),
      "cmu: return address from pickup",
    );
    t(
      body.includes('"return_state":"JK"'),
      "cmu: return_state cleaned of & (would break form parsing)",
    );
    t(body.includes('"pickup_location"'), "cmu: pickup_location present");
    const jsonPart = body.slice(body.indexOf("data=") + 5);
    t(
      !/[&#%;\\]/.test(jsonPart),
      "cmu: no form-breaking chars anywhere in the data payload",
    );
  }
  {
    const r = parseCreateShipmentResponse(
      200,
      JSON.stringify({
        shipments: [{ name: "SAKSHITH SHETTY", waybill: "49323510001061" }],
      }),
    );
    t(r.ok && r.waybill === "49323510001061", "cmu: waybill extracted");
  }
  {
    const r = parseCreateShipmentResponse(
      200,
      JSON.stringify({
        package_count: 1,
        upload_wbn: "UPL11185518272788448003",
        packages: [{ waybill: "49323510001072", refnum: "KF46VSFP" }],
      }),
    );
    t(r.ok && r.waybill === "49323510001072", "cmu: waybill from packages[]");
  }
  t(
    parseCreateShipmentResponse(200, JSON.stringify({ shipments: [] })).ok ===
      false,
    "cmu: no waybill → error",
  );
  t(
    parseCreateShipmentResponse(401, '{"detail":"Invalid token"}').ok === false,
    "cmu: 401 → credentials",
  );
  t(
    parseCreateShipmentResponse(200, "<html>err").ok === false,
    "cmu: non-JSON → error",
  );

  // ── Bulk waybill fetch ────────────────────────────────────────────────────
  {
    const r = parseBulkWaybills(
      200,
      JSON.stringify({ waybills: ["49323510001061", "49323510001062"] }),
    );
    t(
      r.ok && r.waybills.length === 2 && r.waybills[0] === "49323510001061",
      "bulk waybills parsed",
    );
  }
  t(
    parseBulkWaybills(200, JSON.stringify({ waybills: [] })).ok === false,
    "bulk: empty waybills → error",
  );
  t(
    parseBulkWaybills(401, '{"detail":"Invalid token"}').ok === false,
    "bulk: 401 → credentials",
  );

  // ── Expected TAT ───────────────────────────────────────────────────────────
  {
    const r = parseExpectedTat(200, '{"TAT":"2","D2D":"2"}', "E");
    t(r.ok && r.mot === "E" && r.days === 2, "tat: numeric days extracted");
  }
  {
    const r = parseExpectedTat(
      200,
      '{"tat_d2d":"3 Days","origin":"575002","destination":"575001"}',
      "S",
    );
    t(r.ok && r.mot === "S" && r.days === 3, "tat: string '3 Days' → 3");
  }
  {
    const r = parseExpectedTat(200, "{}", "E");
    t(r.ok && r.days === null, "tat: missing field → null days, still ok");
  }
  t(parseExpectedTat(404, "{}", "E").ok === false, "tat: 404 → error");

  // ── Shipment edit / cancel (p/edit) ───────────────────────────────────────
  {
    const body = buildEditShipmentBody({
      waybill: "49323510001061",
      pt: "Pre-paid",
      gm: 900,
      shipmentHeightCm: 12,
    });
    t(
      body.includes('"waybill":"49323510001061"') &&
        body.includes('"pt":"Pre-paid"'),
      "p/edit: waybill + payment mode encoded",
    );
    t(
      body.includes('"gm":900') && body.includes('"shipment_height":12'),
      "p/edit: weight + height encoded",
    );
    t(
      buildCancelShipmentBody("49323510001061") ===
        '{"waybill":"49323510001061","cancellation":"true"}',
      "p/edit: cancel payload",
    );
  }
  t(
    parseEditShipmentResponse(200, '{"success":true}').ok === true,
    "p/edit: success=true → ok",
  );
  t(
    parseEditShipmentResponse(200, "{}").ok === true,
    "p/edit: bare 200 JSON treated as success",
  );
  {
    const r = parseEditShipmentResponse(
      200,
      JSON.stringify({ success: false, remark: "Waybill not found" }),
    );
    t(!r.ok && /not found/i.test(r.message), "p/edit: refusal remark surfaced");
  }
  t(
    parseEditShipmentResponse(
      200,
      JSON.stringify({ error: true, error_message: "Bad request" }),
    ).ok === false,
    "p/edit: error-true → fail",
  );
  t(
    parseEditShipmentResponse(401, '{"detail":"Invalid token"}').ok === false,
    "p/edit: 401 → credentials",
  );
  t(
    parseEditShipmentResponse(200, "<html>err").ok === false,
    "p/edit: non-JSON → error",
  );

  // ── Pickup request ─────────────────────────────────────────────────────────
  {
    const body = buildPickupRequestBody({
      pickupLocation: "KeebForge HQ",
      pickupDate: "2026-09-06",
      pickupTime: "11:00:00",
      expectedPackageCount: 1,
    });
    t(
      body.includes('"pickup_location":"KeebForge HQ"') &&
        body.includes('"pickup_date":"2026-09-06"') &&
        body.includes('"expected_package_count":1'),
      "pickup: payload built",
    );
  }
  {
    const r = parsePickupRequest(200, JSON.stringify({ pickup_id: "PICK123" }));
    t(r.ok && r.pickupId === "PICK123", "pickup: pickup_id captured");
  }
  {
    // Delhivery returns pickup_id as a JSON number (e.g. 319061654) — keep it.
    const r = parsePickupRequest(200, JSON.stringify({ pickup_id: 319061654 }));
    t(r.ok && r.pickupId === "319061654", "pickup: numeric pickup_id captured");
  }
  {
    const r = parsePickupRequest(
      200,
      JSON.stringify({
        error: true,
        status: "Failed",
        remark: "Warehouse not found",
      }),
    );
    t(
      r.ok === false && r.message.includes("Warehouse"),
      "pickup: error shape → refusal with remark",
    );
  }
  t(
    parsePickupRequest(401, '{"detail":"Invalid token"}').ok === false,
    "pickup: 401 → credentials",
  );
  {
    const r = parsePickupRequest(
      401,
      JSON.stringify({
        pickup_location:
          "Invalid Pickup Location ClientWarehouse matching query does not exist.",
      }),
    );
    t(
      r.ok === false &&
        r.message.includes("Invalid Pickup Location") &&
        r.message.includes("ClientWarehouse"),
      "pickup: 401 warehouse-name reason surfaced (not masked as creds)",
    );
  }
  t(
    parsePickupRequest(200, "<html>err").ok === false,
    "pickup: non-JSON → error",
  );
  {
    const r = parsePickupRequest(
      400,
      JSON.stringify({ pickup_time: "Pickup time cannot be in past" }),
    );
    t(
      r.ok === false && r.message.includes("in past"),
      "pickup: 400 surfaces the field reason",
    );
  }

  // ── Client warehouse (pickup location) registration ────────────────────────
  t(
    parseWarehouseResponse(
      200,
      JSON.stringify({ success: true, name: "test_name" }),
    ).ok === true,
    "warehouse: 200 success",
  );
  {
    const r = parseWarehouseResponse(
      200,
      JSON.stringify({ rmk: "Warehouse already exists", success: false }),
    );
    t(
      !r.ok && /already/i.test(r.message ?? ""),
      "warehouse: success=false with rmk detected",
    );
  }
  t(
    parseWarehouseResponse(
      400,
      '{"rmk":"ClientWarehouse matching query does not exist."}',
    ).ok === false,
    "warehouse: 400 rmk extracted",
  );
  t(
    parseWarehouseResponse(401, '{"detail":"Invalid token"}').ok === false,
    "warehouse: 401 → credentials",
  );
  t(
    parseWarehouseResponse(200, "<html>err").ok === false,
    "warehouse: non-JSON → error",
  );

  if (failed === 0) console.log(`shipping self-check passed`);
}
