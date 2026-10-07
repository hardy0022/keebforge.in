import { NextRequest, NextResponse } from "next/server";
import {
  calculateShipping,
  cartWeightGrams,
  calculateVolumetricWeight,
  enabledShippingModes,
  isValidPincode,
  ratingOriginPincode,
  SHIPPING_ERROR_MESSAGES,
  toShippingMode,
  type ShippingErrorCode,
} from "@/lib/shipping/delhivery";
import {
  type ServiceShippingMethod,
} from "@/lib/shipping/shipping-estimate";
import { PACKAGE_LIMITS, isValidPackage } from "@/lib/shipping/package-limits";

export const dynamic = "force-dynamic";

/**
 * POST /api/shipping/service-quote
 * Body: { pincode, lengthCm, widthCm, heightCm, weightKg, mode?, method? }
 *
 * Quotes the two physically distinct legs of a mods order, each against
 * Delhivery's real rate card (see shipping-estimate.ts for the mapping):
 *
 *   return  workshop → customer, `ss=Delivered`  (the "Forward" dashboard tab)
 *   pickup  customer → workshop, `ss=DTO`        (the "Reverse Pickup (RVP)"
 *                                                 dashboard tab), quoted only
 *                                                 when method === "pickup"
 *
 * Origin/credentials never come from the browser; amounts are integer paise.
 * `forwardPaise` is kept as an alias of `returnPaise` for older callers.
 */
function fail(status: number, errorCode: ShippingErrorCode) {
  return NextResponse.json(
    { success: false, errorCode, message: SHIPPING_ERROR_MESSAGES[errorCode] },
    { status },
  );
}

const SHIPPING_METHODS: ServiceShippingMethod[] = [
  "customer_shipping",
  "pickup",
];

function toServiceMethod(v: unknown): ServiceShippingMethod | null {
  return typeof v === "string" &&
    (SHIPPING_METHODS as readonly string[]).includes(v)
    ? (v as ServiceShippingMethod)
    : null;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "INVALID_PINCODE");
  }

  const { pincode } = body;
  const dims = [body.lengthCm, body.widthCm, body.heightCm].map((v) =>
    Number(v),
  );
  const weightKg = Number(body.weightKg);

  if (!isValidPincode(pincode)) return fail(400, "INVALID_PINCODE");
  if (
    !isValidPackage({
      lengthCm: dims[0],
      widthCm: dims[1],
      heightCm: dims[2],
      weightKg,
    })
  ) {
    return NextResponse.json(
      {
        success: false,
        errorCode: "INVALID_PACKAGE",
        message: `Enter packed dimensions up to ${PACKAGE_LIMITS.MAX_DIM_CM} cm per side and weight up to ${PACKAGE_LIMITS.MAX_WEIGHT_KG} kg.`,
      },
      { status: 400 },
    );
  }

  // Chargeable weight follows the same Delhivery rule as product carts:
  // max(actual, volumetric L·W·H/5000). Single package, quantity 1.
  const actualGrams = cartWeightGrams([
    { quantity: 1, weight: Math.round(weightKg * 1000) },
  ]);
  const volumetricGrams = calculateVolumetricWeight([
    { quantity: 1, lengthCm: dims[0], widthCm: dims[1], heightCm: dims[2] },
  ]);
  const weightGrams = Math.max(actualGrams ?? 0, volumetricGrams ?? 0);
  if (weightGrams <= 0) return fail(400, "MISSING_SHIPPING_CONFIGURATION");

  // Optional delivery-speed preference; must be one the storefront offers.
  const requestedMode = toShippingMode(body.mode);
  if (
    body.mode != null &&
    (!requestedMode || !enabledShippingModes().includes(requestedMode))
  ) {
    return NextResponse.json(
      {
        success: false,
        errorCode: "INVALID_PACKAGE",
        message: "Unsupported shipping mode.",
      },
      { status: 400 },
    );
  }

  // Which legs the customer is charged for. Absent → legacy single-leg callers
  // (the return leg only), which is what the old contract always priced.
  const method =
    body.method == null ? "customer_shipping" : toServiceMethod(body.method);
  if (method === null) {
    return NextResponse.json(
      {
        success: false,
        errorCode: "INVALID_PACKAGE",
        message: "Unsupported shipping method.",
      },
      { status: 400 },
    );
  }

  const workshopPin = ratingOriginPincode();
  if (!isValidPincode(workshopPin)) return fail(502, "NOT_CONFIGURED");

  // ── Return leg: workshop → customer ──────────────────────────────────────
  const ret = await calculateShipping({
    destinationPincode: pincode as string,
    paymentMode: "Pre-paid",
    weightGrams,
    ...(requestedMode ? { mode: requestedMode } : {}),
    quoteType: "forward",
  });
  if (!ret.ok)
    return NextResponse.json(
      { success: false, errorCode: ret.errorCode, message: ret.message },
      { status: 502 },
    );

  // ── Pickup leg: customer → workshop (reverse pickup, ss=DTO) ─────────────
  let pickupPaise: number | null = null;
  if (method === "pickup") {
    const pu = await calculateShipping({
      destinationPincode: workshopPin,
      originPincode: pincode as string,
      paymentMode: "Pre-paid",
      weightGrams,
      ...(requestedMode ? { mode: requestedMode } : {}),
      quoteType: "dto",
    });
    if (!pu.ok)
      return NextResponse.json(
        { success: false, errorCode: pu.errorCode, message: pu.message },
        { status: 502 },
      );
    pickupPaise = pu.quote.amountPaise;
  }

  const returnPaise = ret.quote.amountPaise;
  return NextResponse.json({
    success: true,
    forwardPaise: returnPaise,
    returnPaise,
    pickupPaise,
    mode: ret.quote.mode,
    weightGrams,
  });
}
