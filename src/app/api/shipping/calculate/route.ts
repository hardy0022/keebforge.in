import { NextRequest, NextResponse } from "next/server";
import { getCartWithItems } from "@/lib/cart";
import { resolveConfiguredPrice } from "@/lib/product-options";
import {
  calculateShipping,
  chargeableWeightGrams,
  estimatedDaysFor,
  isFreeShipping,
  isValidPincode,
  SHIPPING_ERROR_MESSAGES,
  ShippingErrorCode,
  ShippingMode,
  toShippingMode,
  enabledShippingModes,
} from "@/lib/shipping";

export const dynamic = "force-dynamic";

const METHOD_NAMES: Record<ShippingMode, string> = { surface: "Surface Shipping", express: "Express Shipping" };

/**
 * POST /api/shipping/calculate
 * Body: { destinationPincode: string }
 *
 * Quotes every configured shipping mode (surface/express) in parallel against
 * the caller's server-side cart. Modes that quote successfully are returned;
 * if only some succeed only those are shown; if none succeed the highest-
 * priority taxonomy error is returned. Weight, origin, subtotal and cart
 * identity never come from the browser. Amounts are integer paise.
 */
export async function POST(req: NextRequest) {
  const shippingError = (status: number, errorCode: ShippingErrorCode) =>
    NextResponse.json({ success: false, shipping: [], errorCode, message: SHIPPING_ERROR_MESSAGES[errorCode] }, { status });

  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return shippingError(400, "INVALID_PINCODE");
    }
    const { destinationPincode } = (body ?? {}) as Record<string, unknown>;
    if (!isValidPincode(destinationPincode)) return shippingError(400, "INVALID_PINCODE");

    const modes = enabledShippingModes();
    // Legacy single-mode requests still work but the response is always an array.
    const modeParam = toShippingMode((body as Record<string, unknown>).mode);
    const quotedModes = modeParam && modes.includes(modeParam) ? [modeParam] : modes;

    // ── Server-side cart is the single source of truth ──────────────────────
    const cart = await getCartWithItems();
    const items = cart?.items ?? [];
    if (items.length === 0) return shippingError(400, "EMPTY_CART");

    let subtotal = 0;
    for (const item of items) {
      let unitPrice = item.variant?.price ?? item.product.price;
      const cfg = item.config as { kind?: string; optionIds?: string[] } | null;
      if (cfg?.kind === "options" && cfg.optionIds?.length) {
        const resolved = resolveConfiguredPrice(item.product.optionGroups, item.product.price, cfg.optionIds);
        if (resolved.ok) unitPrice = resolved.unitPrice;
      }
      subtotal += unitPrice * item.quantity;
    }

    // Free-shipping rules run entirely server-side; Delhivery is not called.
    if (isFreeShipping({ items: items.map((i) => ({ freeShipping: i.product.freeShipping })), subtotalPaise: subtotal })) {
      return NextResponse.json({
        success: true,
        free: true,
        shipping: [],
        errorCode: null,
      });
    }

    // Chargeable weight from real catalog data; missing weights are a loud
    // configuration error, never a guessed default.
    let weightGrams: number;
    try {
      weightGrams = chargeableWeightGrams(
        items.map((i) => ({
          quantity: i.quantity,
          weight: i.product.weight,
          variantWeight: i.variant?.weight ?? null,
          lengthCm: i.product.lengthCm,
          widthCm: i.product.widthCm,
          heightCm: i.product.heightCm,
        })),
      ).weightGrams;
    } catch {
      console.error("[shipping/calculate] product(s) missing shipping weight:", items.map((i) => ({ id: i.productId, name: i.product.name })));
      return shippingError(422, "MISSING_SHIPPING_CONFIGURATION");
    }

    // Quote every configured mode in parallel.
    const results = await Promise.all(
      quotedModes.map(async (mode) =>
        [mode, await calculateShipping({ destinationPincode, paymentMode: "Pre-paid", weightGrams, mode })] as const,
      ),
    );

    const options = results
      .filter(([, r]) => r.ok)
      .map(([mode, r]) => ({
        method: mode,
        name: METHOD_NAMES[mode],
        carrier: "Delhivery",
        amountPaise: (r.ok ? r.quote.amountPaise : 0),
        currency: "INR" as const,
        estimatedDays: estimatedDaysFor(mode),
      }));
    if (options.length > 0) {
      return NextResponse.json({ success: true, shipping: options, errorCode: null });
    }

    // Nothing succeeded — surface the most actionable taxonomy error.
    const errors = results.map(([, r]) => (r.ok ? null : r.errorCode));
    const priority: ShippingErrorCode[] = ["PINCODE_UNAVAILABLE", "RATE_LIMITED", "UPSTREAM_ERROR", "INVALID_CREDENTIALS"];
    const first = priority.find((c) => errors.includes(c)) ?? "UPSTREAM_ERROR";
    return shippingError(first === "PINCODE_UNAVAILABLE" ? 422 : first === "RATE_LIMITED" ? 429 : 502, first);
  } catch (err) {
    console.error("[shipping/calculate] unexpected error:", err);
    return shippingError(502, "UPSTREAM_ERROR");
  }
}
