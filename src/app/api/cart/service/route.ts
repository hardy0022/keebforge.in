import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAuth } from "@/lib/auth";
import { cartForCurrentUser, CART_COOKIE } from "@/lib/cart";
import {
  calculateShipping,
  calculateVolumetricWeight,
  cartWeightGrams,
  enabledShippingModes,
  isValidPincode,
  toShippingMode,
} from "@/lib/shipping";
import { deriveLegs } from "@/lib/shipping-estimate";

export const dynamic = "force-dynamic";

const pinSchema = z.string().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code");

const serviceConfigSchema = z.object({
  deviceType: z.enum(["KEYBOARD", "MOUSE"]),
  brand: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(80),
  layout: z.string().trim().max(40).nullable().optional(),
  switchModel: z.string().trim().max(80).nullable().optional(),
  switchQuantity: z.number().int().min(0).max(999),
  stabilizerQuantity: z.number().int().min(0).max(999),
  keycapsIncluded: z.boolean(),
  serviceIds: z.array(z.string().min(1)).min(1).max(30),
  // Mods shipping/pickup block (steps 03–04 of the configurator). Optional so
  // older stashes stay loadable; quote amounts below are RECALCULATED
  // server-side before storage — client values are never trusted.
  shipping: z
    .object({
      method: z.enum(["customer_shipping", "pickup", "undecided"]),
      mode: z.enum(["surface", "express"]).optional(),
      address: z.object({
        street: z.string().trim().max(280),
        city: z.string().trim().max(80),
        state: z.string().trim().max(80),
        pincode: pinSchema.or(z.literal("")),
      }),
      package: z.object({
        lengthCm: z.number().min(0).max(152),
        widthCm: z.number().min(0).max(152),
        heightCm: z.number().min(0).max(152),
        weightKg: z.number().min(0).max(30),
      }),
      quote: z.object({
        pickupPaise: z.number().int().min(0).nullable(),
        returnPaise: z.number().int().min(0).nullable(),
        totalPaise: z.number().int().min(0).nullable(),
      }),
      totals: z
        .object({
          serviceSubtotalPaise: z.number().int().min(0).nullable(),
          estimatedTotalPaise: z.number().int().min(0).nullable(),
        })
        .optional(),
    })
    .optional(),
  // Step 05 buyer contact — required by the UI, optional here so legacy rows load.
  contact: z
    .object({
      name: z.string().trim().min(2).max(120),
      phone: z.string().trim().regex(/^\d{10}$/, "Enter a valid 10-digit phone number"),
      email: z.string().trim().email(),
      alt: z.string().trim().max(280),
    })
    .optional(),
});

/** Stashes (or replaces) the configurator's service job on the caller's cart. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = serviceConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid configuration." }, { status: 400 });
    }

    const ids = [...new Set(parsed.data.serviceIds)];
    const activeCount = await prisma.service.count({ where: { id: { in: ids }, active: true } });
    if (activeCount !== ids.length) {
      return NextResponse.json({ error: "One or more selected services are no longer available." }, { status: 400 });
    }

    // ── Authoritative shipping recalculation before storage ─────────────────
    // The browser's quote is display-only. When a real shipping method was
    // chosen, BOTH legs are re-quoted here from the stored inputs; the server
    // numbers overwrite whatever the client sent.
    const sh = parsed.data.shipping;
    if (sh && sh.method !== "undecided") {
      if (!isValidPincode(sh.address.pincode) || !isValidPincode(process.env.DELHIVERY_ORIGIN_PINCODE ?? "")) {
        return NextResponse.json({ error: "Enter a valid PIN code to calculate shipping." }, { status: 422 });
      }
      const pkg = sh.package;
      if (pkg.lengthCm <= 0 || pkg.widthCm <= 0 || pkg.heightCm <= 0 || pkg.weightKg <= 0) {
        return NextResponse.json({ error: "Enter valid package dimensions and weight." }, { status: 422 });
      }
      const actualGrams = cartWeightGrams([{ quantity: 1, weight: Math.round(pkg.weightKg * 1000) }]);
      const volumetric = calculateVolumetricWeight([
        { quantity: 1, lengthCm: pkg.lengthCm, widthCm: pkg.widthCm, heightCm: pkg.heightCm },
      ]);
      const weightGrams = Math.max(actualGrams ?? 0, volumetric ?? 0);

      // Delivery-speed preference must be one the storefront offers.
      const mode = toShippingMode(sh.mode);
      if (sh.mode != null && (!mode || !enabledShippingModes().includes(mode))) {
        return NextResponse.json({ error: "Unsupported shipping mode." }, { status: 400 });
      }
      const modeOpt = mode ? { mode } : {};

      const fwd = await calculateShipping({ destinationPincode: sh.address.pincode, paymentMode: "Pre-paid", weightGrams, ...modeOpt });
      if (!fwd.ok) {
        return NextResponse.json({ error: fwd.message, errorCode: fwd.errorCode }, { status: 422 });
      }
      const legs = deriveLegs(fwd.quote.amountPaise, sh.method);
      parsed.data.shipping = {
        ...sh,
        quote: {
          pickupPaise: legs.pickupPaise,
          returnPaise: legs.returnPaise,
          totalPaise: legs.totalPaise,
        },
      };
    }

    const cart = await cartForCurrentUser();
    await prisma.cartServiceItem.upsert({
      where: { cartId: cart.id },
      update: { config: parsed.data },
      create: { cartId: cart.id, config: parsed.data },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to add the configuration to your cart." }, { status: 500 });
  }
}

/** Removes the stashed service job (e.g. after its order has been created). */
export async function DELETE() {
  try {
    const { user, profile } = await getCurrentAuth();
    let ownerWhere: { profileId: string } | { guestToken: string } | null = null;
    if (user && profile) {
      ownerWhere = { profileId: profile.id };
    } else {
      const token = (await cookies()).get(CART_COOKIE)?.value;
      if (token) ownerWhere = { guestToken: token };
    }
    if (!ownerWhere) return NextResponse.json({ ok: true });

    const cart = await prisma.cart.findFirst({ where: ownerWhere, select: { id: true } });
    if (cart) {
      await prisma.cartServiceItem.deleteMany({ where: { cartId: cart.id } });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to update cart" }, { status: 500 });
  }
}
