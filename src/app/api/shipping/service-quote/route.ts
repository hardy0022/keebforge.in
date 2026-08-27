import { NextRequest, NextResponse } from "next/server";
import {
  calculateShipping,
  cartWeightGrams,
  calculateVolumetricWeight,
  enabledShippingModes,
  isValidPincode,
  SHIPPING_ERROR_MESSAGES,
  toShippingMode,
  type ShippingErrorCode,
} from "@/lib/shipping";
import { PACKAGE_LIMITS, isValidPackage } from "@/lib/package-limits";

export const dynamic = "force-dynamic";

/**
 * POST /api/shipping/service-quote
 * Body: { pincode, lengthCm, widthCm, heightCm, weightKg, mode? }
 *
 * Quotes the standard FORWARD leg (DELHIVERY_ORIGIN_PINCODE → customer PIN)
 * for a mods order. There is no reverse-pickup rate in the Delhivery API, so
 * callers derive the pickup estimate from this one number via deriveLegs()
 * — never a second API call. Origin/credentials never come from the browser;
 * amounts are integer paise.
 */
function fail(status: number, errorCode: ShippingErrorCode) {
  return NextResponse.json({ success: false, errorCode, message: SHIPPING_ERROR_MESSAGES[errorCode] }, { status });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "INVALID_PINCODE");
  }

  const { pincode } = body;
  const dims = [body.lengthCm, body.widthCm, body.heightCm].map((v) => Number(v));
  const weightKg = Number(body.weightKg);

  if (!isValidPincode(pincode)) return fail(400, "INVALID_PINCODE");
  if (!isValidPackage({ lengthCm: dims[0], widthCm: dims[1], heightCm: dims[2], weightKg })) {
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
  const actualGrams = cartWeightGrams([{ quantity: 1, weight: Math.round(weightKg * 1000) }]);
  const volumetricGrams = calculateVolumetricWeight([
    { quantity: 1, lengthCm: dims[0], widthCm: dims[1], heightCm: dims[2] },
  ]);
  const weightGrams = Math.max(actualGrams ?? 0, volumetricGrams ?? 0);
  if (weightGrams <= 0) return fail(400, "MISSING_SHIPPING_CONFIGURATION");

  // Optional delivery-speed preference; must be one the storefront offers.
  const requestedMode = toShippingMode(body.mode);
  if (body.mode != null && (!requestedMode || !enabledShippingModes().includes(requestedMode))) {
    return NextResponse.json({ success: false, errorCode: "INVALID_PACKAGE", message: "Unsupported shipping mode." }, { status: 400 });
  }

  const fwd = await calculateShipping({
    destinationPincode: pincode as string,
    paymentMode: "Pre-paid",
    weightGrams,
    ...(requestedMode ? { mode: requestedMode } : {}),
  });
  if (!fwd.ok) return NextResponse.json({ success: false, errorCode: fwd.errorCode, message: fwd.message }, { status: 502 });

  return NextResponse.json({
    success: true,
    forwardPaise: fwd.quote.amountPaise,
    mode: fwd.quote.mode,
    weightGrams,
  });
}
