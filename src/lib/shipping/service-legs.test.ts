/**
 * Offline regression suite for the two-leg mods/services shipping quote.
 * No network, no database, no Delhivery credentials.
 *
 * What this protects:
 *   - the origin pin actually used for the request (the bug that produced the
 *     screenshot: pickup ₹169 / return ₹112 / total ₹281 on a 181206↔575002
 *     order, because the quote was priced intra-city out of 575002),
 *   - leg direction and `ss` sub-service mapping,
 *   - exact paise amounts against Delhivery's own response payloads,
 *   - chargeable-weight math,
 *   - error taxonomy and the "never quote ₹0" rule,
 *   - that no credential can reach a customer-visible message.
 *
 * Run: npm run check:shipping-legs
 */
import {
  SHIPPING_ERROR_MESSAGES,
  cacheKey,
  calculateShippingParams,
  calculateVolumetricWeight,
  chargeableWeightGrams,
  isValidPincode,
  parseShippingResponse,
  ratingOriginPincode,
  ssValueFor,
  type ShippingErrorCode,
  type ShippingQuote,
  type ShippingResult,
} from "@/lib/shipping/delhivery";
import { deriveLegs } from "@/lib/shipping/shipping-estimate";

// ── Fixture: production payloads captured 2026-10-06 from Delhivery's live
//    charges API for the exact lane the storefront must price (181206 → 575002,
//    cgm=1400, Pre-paid). Every total_amount below was confirmed equal to the
//    Delhivery One rate-calculator tabs at the same inputs.
const WORKSHOP = "181206";
const CUSTOMER = "575002";

const PAYLOADS: Record<string, string> = {
  forwardSurface: JSON.stringify([
    {
      status: "Delivered",
      zone: "E",
      charge_DL: 186,
      charge_RTO: 0,
      charge_DTO: 0,
      gross_amount: 194.85,
      total_amount: 229.93,
      charged_weight: 1400,
      charge_DPH: 6.85,
      charge_PEAK: 2,
      tax_data: { SGST: 17.54, CGST: 17.54, IGST: 0 },
      divisor: 5000,
      wt_sop_type: "dead_lt",
    },
  ]),
  forwardExpress: JSON.stringify([
    {
      status: "Delivered",
      zone: "E",
      charge_DL: 245,
      charge_RTO: 0,
      charge_DTO: 0,
      gross_amount: 258.03,
      total_amount: 304.47,
      charged_weight: 1400,
      charge_DPH: 9.03,
      charge_PEAK: 4,
      tax_data: { SGST: 23.22, CGST: 23.22, IGST: 0 },
      divisor: 5000,
      wt_sop_type: "dead_lt",
    },
  ]),
  dtoSurface: JSON.stringify([
    {
      status: "DTO",
      zone: "E",
      charge_DL: 0,
      charge_RTO: 0,
      charge_DTO: 280,
      gross_amount: 292.32,
      total_amount: 344.94,
      charged_weight: 1400,
      charge_DPH: 10.32,
      charge_PEAK: 2,
      tax_data: { SGST: 26.31, CGST: 26.31, IGST: 0 },
      divisor: 5000,
      wt_sop_type: "dead_lt",
    },
  ]),
  dtoExpress: JSON.stringify([
    {
      status: "DTO",
      zone: "E",
      charge_DL: 0,
      charge_RTO: 0,
      charge_DTO: 326,
      gross_amount: 342.01,
      total_amount: 403.57,
      charged_weight: 1400,
      charge_DPH: 12.01,
      charge_PEAK: 4,
      tax_data: { SGST: 30.78, CGST: 30.78, IGST: 0 },
      divisor: 5000,
      wt_sop_type: "dead_lt",
    },
  ]),
  rtoSurface: JSON.stringify([
    {
      status: "RTO",
      zone: "E",
      charge_DL: 186,
      charge_RTO: 186,
      charge_DTO: 0,
      gross_amount: 387.71,
      total_amount: 457.49,
      charged_weight: 1400,
      charge_DPH: 13.71,
      charge_PEAK: 2,
      tax_data: { SGST: 34.89, CGST: 34.89, IGST: 0 },
      divisor: 5000,
      wt_sop_type: "dead_lt",
    },
  ]),
};

const CREDENTIALS =
  "sk_TEST_SECRET__" + "MUST_NEVER_REACH_A_CUSTOMER";

/** Everything a customer can ever see for one parse outcome. */
const visibleText = (r: ShippingResult): string => {
  if (r.ok) return JSON.stringify(r.quote as ShippingQuote);
  return `${r.errorCode} ${r.message}`;
};

function run() {
  let failed = 0;
  const t = (cond: boolean, tag: string) => {
    if (!cond) {
      console.error(`FAIL: ${tag}`);
      failed++;
      process.exitCode = 1;
    }
  };
  const amountOf = (
    payload: string,
    mode: "surface" | "express",
    origin: string,
    destination: string,
  ): number | null => {
    const r = parseShippingResponse(destination, 200, payload, {
      mode,
      weightGrams: 1400,
      originPincode: origin,
    });
    return r.ok ? r.quote.amountPaise : null;
  };
  const errorOf = (
    payload: string,
    httpStatus: number,
  ): ShippingErrorCode => {
    const r = parseShippingResponse(CUSTOMER, httpStatus, payload, {
      mode: "surface",
      weightGrams: 1400,
      originPincode: WORKSHOP,
    });
    return r.ok ? ("quote" as ShippingErrorCode) : r.errorCode;
  };

  // ── 1. Origin resolution — the root cause of the reported misquote ───────
  t(ratingOriginPincode(WORKSHOP, CUSTOMER) === WORKSHOP, "origin: pickup pin wins");
  t(ratingOriginPincode(undefined, CUSTOMER) === CUSTOMER, "origin: falls back to DELHIVERY_ORIGIN_PINCODE");
  t(ratingOriginPincode("", CUSTOMER) === CUSTOMER, "origin: blank pickup pin falls back");
  t(ratingOriginPincode("   ", CUSTOMER) === CUSTOMER, "origin: whitespace pickup pin falls back");
  t(ratingOriginPincode(WORKSHOP, undefined) === WORKSHOP, "origin: pickup pin alone is enough");
  t(ratingOriginPincode(undefined, undefined) === "", "origin: unconfigured resolves to empty");
  t(ratingOriginPincode("012345", undefined) === "", "origin: leading zero rejected");
  t(ratingOriginPincode("12345", undefined) === "", "origin: 5 digits rejected");
  t(ratingOriginPincode("1234567", undefined) === "", "origin: 7 digits rejected");

  // ── 2. Request construction — direction, pins and sub-service ────────────
  const returnLeg = calculateShippingParams({
    destinationPincode: CUSTOMER,
    originPincode: WORKSHOP,
    paymentMode: "Pre-paid",
    weightGrams: 1400,
    mode: "surface",
    quoteType: "forward",
  });
  const pickupLeg = calculateShippingParams({
    destinationPincode: WORKSHOP,
    originPincode: CUSTOMER,
    paymentMode: "Pre-paid",
    weightGrams: 1400,
    mode: "surface",
    quoteType: "dto",
  });
  t(
    new URLSearchParams(returnLeg.path.split("?")[1]).get("o_pin") === WORKSHOP &&
      new URLSearchParams(returnLeg.path.split("?")[1]).get("d_pin") === CUSTOMER,
    "lane: return leg is workshop → customer",
  );
  t(
    new URLSearchParams(pickupLeg.path.split("?")[1]).get("o_pin") === CUSTOMER &&
      new URLSearchParams(pickupLeg.path.split("?")[1]).get("d_pin") === WORKSHOP,
    "lane: pickup leg is customer → workshop",
  );
  t(
    new URLSearchParams(returnLeg.path.split("?")[1]).get("ss") === "Delivered",
    "lane: return leg prices ss=Delivered (dashboard Forward)",
  );
  t(
    new URLSearchParams(pickupLeg.path.split("?")[1]).get("ss") === "DTO",
    "lane: pickup leg prices ss=DTO (dashboard Reverse Pickup)",
  );
  t(ssValueFor("forward") === "Delivered", "ss: forward → Delivered");
  t(ssValueFor("dto") === "DTO", "ss: dto → DTO");
  t(ssValueFor("rto") === "RTO", "ss: rto → RTO (used for failed deliveries, not a customer return)");
  t(returnLeg.cgm === 1400, "lane: chargeable weight 1400 g");

  // ── 3. Dashboard-verified amounts (items 1–4) ────────────────────────────
  t(amountOf(PAYLOADS.forwardSurface, "surface", WORKSHOP, CUSTOMER) === 22993, "forward surface = ₹229.93 (dashboard)");
  t(amountOf(PAYLOADS.forwardExpress, "express", WORKSHOP, CUSTOMER) === 30447, "forward express = ₹304.47 (dashboard)");
  t(amountOf(PAYLOADS.dtoSurface, "surface", CUSTOMER, WORKSHOP) === 34494, "reverse pickup surface = ₹344.94 (dashboard)");
  t(amountOf(PAYLOADS.dtoExpress, "express", CUSTOMER, WORKSHOP) === 40357, "reverse pickup express = ₹403.57 (dashboard)");
  t(amountOf(PAYLOADS.rtoSurface, "surface", WORKSHOP, CUSTOMER) === 45749, "rto surface = ₹457.49 (dashboard Return/RTO)");
  t(
    amountOf(PAYLOADS.dtoSurface, "surface", CUSTOMER, WORKSHOP) !==
      amountOf(PAYLOADS.forwardSurface, "surface", WORKSHOP, CUSTOMER),
    "legs: reverse and forward legs are not the same price",
  );
  // An `ss=DTO` record reports charge_DL: 0 — never read that as "free".
  t(
    amountOf(PAYLOADS.dtoSurface, "surface", CUSTOMER, WORKSHOP) !== 0,
    "legs: DTO payload must not price as ₹0",
  );

  // ── 4. Weight conversion (item 6) ────────────────────────────────────────
  const dims = [
    { quantity: 1, lengthCm: 35, widthCm: 20, heightCm: 10 },
  ];
  t(
    calculateVolumetricWeight(dims) === 1400,
    "weight: 35×20×10 cm / 5000 = 1400 g",
  );
  t(
    chargeableWeightGrams([
      { quantity: 1, weight: 1269, lengthCm: 35, widthCm: 20, heightCm: 10 },
    ]).weightGrams === 1400,
    "weight: actual 1269 g billed at volumetric 1400 g",
  );
  t(
    chargeableWeightGrams([
      { quantity: 1, weight: 2000, lengthCm: 5, widthCm: 5, heightCm: 5 },
    ]).weightGrams === 2000,
    "weight: heavier actual wins over volumetric",
  );
  t(
    chargeableWeightGrams([{ quantity: 3, weight: 500 }]).weightGrams === 1500,
    "weight: quantity multiplies",
  );
  t(calculateShippingParams({
    destinationPincode: CUSTOMER,
    originPincode: WORKSHOP,
    paymentMode: "Pre-paid",
    weightGrams: 1400.2,
    quoteType: "forward",
  }).cgm === 1401, "weight: cgm rounds up to a whole gram");
  t(calculateShippingParams({
    destinationPincode: CUSTOMER,
    originPincode: WORKSHOP,
    paymentMode: "Pre-paid",
    weightGrams: 0.2,
    quoteType: "forward",
  }).cgm === 1, "weight: cgm has a floor of 1");

  // ── 5. Dimension handling (item 7) ───────────────────────────────────────
  t(calculateVolumetricWeight([{ quantity: 1 }]) === null, "dims: absent dims → no volumetric weight");
  t(calculateVolumetricWeight([
    { quantity: 1, lengthCm: 35, widthCm: 20, heightCm: null },
  ]) === null, "dims: partial dims → no volumetric weight");
  t(calculateVolumetricWeight([
    { quantity: 1, lengthCm: 0, widthCm: 20, heightCm: 10 },
  ]) === null, "dims: zero dim → no volumetric weight");
  t(
    chargeableWeightGrams([{ quantity: 1, weight: 900, lengthCm: 35 }])
      .weightGrams === 900,
    "dims: missing dims fall back to actual weight",
  );

  // ── 6. COD / Pre-paid (item 8) ───────────────────────────────────────────
  const p = (cod: boolean | undefined, payment: "Pre-paid" | "COD") => {
    const q = new URLSearchParams(
      calculateShippingParams({
        destinationPincode: CUSTOMER,
        originPincode: WORKSHOP,
        paymentMode: payment,
        weightGrams: 1400,
        quoteType: "forward",
        ...(cod === undefined ? {} : { cod }),
      }).path.split("?")[1],
    );
    return { pt: q.get("pt"), cod: q.get("cod") };
  };
  t(p(undefined, "Pre-paid").pt === "Pre-paid" && p(undefined, "Pre-paid").cod === "0", "cod: pre-paid sends cod=0");
  t(p(undefined, "COD").pt === "COD" && p(undefined, "COD").cod === "1", "cod: COD sends cod=1");
  t(p(false, "COD").cod === "0", "cod: explicit cod:false overrides payment mode");
  t(p(true, "Pre-paid").cod === "1", "cod: explicit cod:true overrides payment mode");

  // ── 7. Error taxonomy (items 9–13) ───────────────────────────────────────
  t(errorOf(JSON.stringify([{ request_status: "failure", reason: "Address not serviceable" }]), 200) === "PINCODE_UNAVAILABLE", "pincode unavailable: not-serviceable payload");
  t(errorOf(JSON.stringify([{ request_status: "failure", reason: "invalid pin" }]), 200) === "PINCODE_UNAVAILABLE", "pincode unavailable: invalid-pin payload");
  t(errorOf("", 404) === "PINCODE_UNAVAILABLE", "pincode unavailable: HTTP 404");
  t(errorOf("", 401) === "INVALID_CREDENTIALS", "credentials: HTTP 401");
  t(errorOf("", 403) === "INVALID_CREDENTIALS", "credentials: HTTP 403");
  t(errorOf("", 429) === "RATE_LIMITED", "rate limited: HTTP 429");
  t(errorOf("", 500) === "UPSTREAM_ERROR", "upstream: HTTP 500");
  t(errorOf("", 503) === "UPSTREAM_ERROR", "upstream: HTTP 503");
  t(errorOf("<html><body>Gateway timeout</body></html>", 200) === "UPSTREAM_ERROR", "malformed: HTML body");
  t(errorOf("", 200) === "UPSTREAM_ERROR", "malformed: empty body");
  t(errorOf("[]", 200) === "UPSTREAM_ERROR", "malformed: empty array");
  t(errorOf("{}", 200) === "UPSTREAM_ERROR", "malformed: object with no charge fields");
  t(errorOf('"12345"', 200) === "UPSTREAM_ERROR", "malformed: bare scalar");
  t(errorOf("not json at all", 200) === "UPSTREAM_ERROR", "malformed: non-JSON");

  // The invariant behind "never quote ₹0": every failure path is a failure.
  const dtoNoTotal = JSON.stringify([{ status: "DTO", charge_DL: 0 }]);
  const noTotal = parseShippingResponse(CUSTOMER, 200, dtoNoTotal, {
    mode: "surface",
    weightGrams: 1400,
    originPincode: WORKSHOP,
  });
  t(!noTotal.ok, "malformed: a zero-only DTO payload must never quote");

  // A zero/forged amount must never turn into a successful quote either.
  for (const body of ["0", '{"total_amount": 0}', '{"charge_DL": 0}']) {
    const r = parseShippingResponse(CUSTOMER, 200, body, {
      mode: "surface",
      weightGrams: 1400,
      originPincode: WORKSHOP,
    });
    t(!r.ok, `zero amount rejected: ${body}`);
  }

  // ── 8. Leg selection (separation of concerns) ────────────────────────────
  const quoted = { pickupPaise: 34494, returnPaise: 22993 };

  const forPickup = deriveLegs(quoted, "pickup");
  t(forPickup !== null && forPickup.pickupPaise === 34494, "pickup leg: exactly the provider's DTO quote");
  t(forPickup !== null && forPickup.returnPaise === 22993, "pickup method: return leg is the forward quote");
  t(forPickup !== null && forPickup.totalPaise === 34494 + 22993, "pickup method: total is the sum of both quotes");
  t(
    forPickup !== null && forPickup.pickupPaise !== Math.ceil(22993 * 1.5),
    "pickup leg: no 1.5× multiplier survives (old code billed ₹344.90, Delhivery charges ₹344.94)",
  );

  const forCustomerShip = deriveLegs(quoted, "customer_shipping");
  t(forCustomerShip !== null && forCustomerShip.pickupPaise === 0, "customer_shipping: no pickup charge");
  t(forCustomerShip !== null && forCustomerShip.returnPaise === 22993, "customer_shipping: return leg is the forward quote");
  t(forCustomerShip !== null && forCustomerShip.totalPaise === 22993, "customer_shipping: total is the return leg only");

  t(deriveLegs({ pickupPaise: null, returnPaise: 22993 }, "pickup") === null, "pickup with no pickup quote → null");
  t(deriveLegs({ pickupPaise: 34494, returnPaise: null }, "pickup") === null, "pickup with no return quote → null");
  t(deriveLegs({ pickupPaise: 34494, returnPaise: null }, "customer_shipping") === null, "customer_shipping with no return quote → null");
  t(deriveLegs({ pickupPaise: -1, returnPaise: 22993 }, "pickup") === null, "negative pickup quote → null");
  t(deriveLegs({ pickupPaise: Number.NaN, returnPaise: 22993 }, "pickup") === null, "NaN pickup quote → null");
  t(deriveLegs({ pickupPaise: 0, returnPaise: 22993 }, "pickup")?.totalPaise === 22993, "explicit zero pickup quote is selectable");

  // ── 9. Cache-key separation — forward and reverse must not share a slot ──
  const fwdKey = cacheKey(WORKSHOP, CUSTOMER, 1400, "Pre-paid", "surface", "Delivered");
  const dtoKey = cacheKey(CUSTOMER, WORKSHOP, 1400, "Pre-paid", "surface", "DTO");
  t(fwdKey !== dtoKey, "cache: forward and reverse-pickup quotes do not collide");
  t(
    cacheKey(WORKSHOP, CUSTOMER, 1400, "Pre-paid", "surface", "Delivered") !==
      cacheKey(WORKSHOP, CUSTOMER, 1400, "Pre-paid", "express", "Delivered"),
    "cache: surface and express do not collide",
  );
  t(
    cacheKey(WORKSHOP, CUSTOMER, 1400, "Pre-paid", "surface", "Delivered") !==
      cacheKey(WORKSHOP, CUSTOMER, 1401, "Pre-paid", "surface", "Delivered"),
    "cache: weight changes the key",
  );
  t(
    cacheKey(WORKSHOP, CUSTOMER, 1400, "Pre-paid", "surface", "Delivered") !==
      cacheKey(WORKSHOP, CUSTOMER, 1400, "COD", "surface", "Delivered"),
    "cache: payment mode changes the key",
  );

  // ── 10. No credential ever escapes (item 14) ─────────────────────────────
  process.env.DELHIVERY_API_TOKEN = CREDENTIALS;
  const visible: string[] = Object.values(SHIPPING_ERROR_MESSAGES);
  for (const status of [200, 401, 403, 404, 409, 429, 500]) {
    for (const body of [
      PAYLOADS.forwardSurface,
      PAYLOADS.dtoSurface,
      JSON.stringify([{ request_status: "failure", reason: "not serviceable" }]),
      "<html>token=..." + CREDENTIALS + "</html>",
      "",
      "[]",
    ]) {
      const r = parseShippingResponse(CUSTOMER, status, body, {
        mode: "surface",
        weightGrams: 1400,
        originPincode: WORKSHOP,
      });
      visible.push(visibleText(r));
      if (r.ok) {
        t(r.quote.originPincode === WORKSHOP, "quote: origin pin recorded");
        t(r.quote.provider === "delhivery", "quote: provider recorded");
        t(r.quote.currency === "INR", "quote: currency recorded");
      } else {
        t(
          r.message === SHIPPING_ERROR_MESSAGES[r.errorCode],
          `message: ${r.errorCode} comes from the customer-safe table`,
        );
      }
    }
  }
  for (const path of [
    calculateShippingParams({
      destinationPincode: CUSTOMER,
      originPincode: WORKSHOP,
      paymentMode: "COD",
      weightGrams: 1400,
      quoteType: "dto",
    }).path,
    calculateShippingParams({
      destinationPincode: CUSTOMER,
      originPincode: WORKSHOP,
      paymentMode: "Pre-paid",
      weightGrams: 1400,
      quoteType: "forward",
    }).path,
  ]) {
    visible.push(path);
    t(!path.includes("Authorization") && !path.includes(CREDENTIALS), "request: credentials travel in a header, never the URL");
    t(!/Token\s+\S+/i.test(path), "request: no token literal in the query string");
  }
  t(
    visible.every((s) => !s.includes(CREDENTIALS)),
    "no customer-visible string contains the API token",
  );
  t(
    Object.values(SHIPPING_ERROR_MESSAGES).every(
      (m) => !/Token|api[_ -]?key|Authorization|Bearer/i.test(m),
    ),
    "no customer-visible message mentions a credential",
  );
  delete process.env.DELHIVERY_API_TOKEN;

  // ── 11. Guardrails: pincode helper agrees with the taxonomy ──────────────
  t(isValidPincode(WORKSHOP) && isValidPincode(CUSTOMER), "pins: fixture pins are valid");
  t(SHIPPING_ERROR_MESSAGES.INVALID_CREDENTIALS !== "", "taxonomy: every code has a message");

  const msg = failed === 0 ? "all shipping leg checks passed" : `${failed} shipping leg check(s) FAILED`;
  if (failed === 0) console.log(`ok: ${msg}`);
  else console.error(msg);
}

if (
  process.argv[1]?.endsWith("shipping/service-legs.test.ts") ||
  process.argv[1]?.endsWith("shipping/service-legs.test.js")
) {
  run();
}
