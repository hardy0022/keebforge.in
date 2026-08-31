import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAuth } from "@/lib/auth";
import Razorpay from "razorpay";
import { z } from "zod";
import { calculateServiceOrder } from "@/lib/services/pricing";
import { loadActiveServiceConfigs } from "@/lib/services/server";
import {
  calculateShipping,
  calculateVolumetricWeight,
  cartWeightGrams,
  enabledShippingModes,
  isValidPincode,
  toShippingMode,
} from "@/lib/shipping";
import { deriveLegs } from "@/lib/shipping-estimate";
import { PACKAGE_LIMITS, isValidPackage } from "@/lib/package-limits";
import { generateOrderNumber } from "@/lib/orders";
import { syncTrackingCache } from "@/lib/tracking";
import { validateCoupon, couponOrderCreateData, incrementCouponUsage, type CouponEligible } from "@/lib/coupons";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  deviceType: z.enum(["KEYBOARD", "MOUSE"]),
  brand: z.string().trim().min(1, "Brand is required").max(80),
  model: z.string().trim().min(1, "Model is required").max(120),
  layout: z.string().trim().max(40).nullish(),
  switchModel: z.string().trim().max(160).nullish(),
  switchQuantity: z.number().int().min(1).max(999),
  stabilizerQuantity: z.number().int().min(0).max(999),
  keycapsIncluded: z.boolean(),
  serviceIds: z.array(z.string().min(1)).min(1, "Select at least one service").max(60),
  customer: z.object({
    firstName: z.string().trim().min(1, "First name is required").max(80),
    lastName: z.string().trim().min(1, "Last name is required").max(80),
    email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
    phone: z.string().trim().min(5, "Enter a valid phone number").max(20),
  }),
  // Mods Shipping/Packaging block from the configurator. Amounts here are
  // display-only — both legs are re-quoted server-side before charging.
  modsShipping: z
    .object({
      method: z.enum(["customer_shipping", "pickup", "undecided"]),
      mode: z.enum(["surface", "express"]).optional(),
      address: z.object({
        pincode: z.string().regex(/^\d{6}$/).or(z.literal("")),
      }),
      package: z.object({
        lengthCm: z.number().min(0),
        widthCm: z.number().min(0),
        heightCm: z.number().min(0),
        weightKg: z.number().min(0),
      }),
    })
    .optional(),
  contactNote: z.string().trim().max(280).optional(),
  couponCode: z.string().trim().max(40).optional(),
  saveAddress: z.boolean().optional(),
  shippingAddress: z.object({
    streetAddress: z.string().trim().min(1, "Address is required").max(280),
    addressLine2: z.string().trim().max(280).optional(),
    city: z.string().trim().min(1, "City is required").max(80),
    state: z.string().trim().min(1, "State is required").max(80),
    postalCode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit PIN code"),
    country: z.string().trim().max(80).optional(),
  }),
});

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

/**
 * Service order creation.
 *
 * SECURITY: the client sends ONLY configuration (service IDs + quantities +
 * device details). Every price is recomputed here from the live database via
 * the shared pricing module — client-supplied amounts are never trusted.
 */
export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid order data" },
        { status: 400 }
      );
    }
    const cfg = parsed.data;
    const customerName = [cfg.customer.firstName, cfg.customer.lastName].filter(Boolean).join(" ");

    // Authoritative inputs: services straight from the DB (active only).
    const ids = [...new Set(cfg.serviceIds)];
    const serviceConfigs = await loadActiveServiceConfigs(ids);
    if (serviceConfigs.length !== ids.length) {
      return NextResponse.json(
        { error: "One or more selected services are no longer available. Please refresh your configuration." },
        { status: 400 }
      );
    }

    const totals = calculateServiceOrder(serviceConfigs, cfg);
    if (totals.selectedCount === 0) {
      return NextResponse.json({ error: "Select at least one service to continue" }, { status: 400 });
    }

    // ── Authoritative mods shipping recalculation (both legs re-quoted here;
    //    client amounts are never trusted). Adds the real paise to the total. ──
    const mods = cfg.modsShipping;
    let shipPaise = 0;
    let shipMeta: {
      method: string; mode: string; weightGrams: number;
      originPincode: string; destinationPincode: string;
      pickupPaise: number | null; returnPaise: number | null; totalPaise: number;
    } | null = null;
    if (mods && mods.method !== "undecided") {
      const mode = toShippingMode(mods.mode) ?? "express";
      if (!enabledShippingModes().includes(mode)) {
        return NextResponse.json({ error: "Unsupported shipping mode." }, { status: 400 });
      }
      const pin = mods.address.pincode || cfg.shippingAddress.postalCode;
      const origin = process.env.DELHIVERY_ORIGIN_PINCODE ?? "";
      if (!isValidPincode(pin) || !isValidPincode(origin)) {
        return NextResponse.json({ error: "Enter a valid PIN code to calculate shipping." }, { status: 422 });
      }
      const pkg = mods.package;
      if (!isValidPackage({ lengthCm: pkg.lengthCm, widthCm: pkg.widthCm, heightCm: pkg.heightCm, weightKg: pkg.weightKg })) {
        return NextResponse.json(
          { error: `Enter packed dimensions up to ${PACKAGE_LIMITS.MAX_DIM_CM} cm per side and weight up to ${PACKAGE_LIMITS.MAX_WEIGHT_KG} kg.` },
          { status: 422 },
        );
      }
      const weightGrams = Math.max(
        cartWeightGrams([{ quantity: 1, weight: Math.round(pkg.weightKg * 1000) }]) ?? 0,
        calculateVolumetricWeight([{ quantity: 1, lengthCm: pkg.lengthCm, widthCm: pkg.widthCm, heightCm: pkg.heightCm }]) ?? 0,
      );
      const fwd = await calculateShipping({ destinationPincode: pin, paymentMode: "Pre-paid", weightGrams, mode });
      if (!fwd.ok) return NextResponse.json({ error: fwd.message, errorCode: fwd.errorCode }, { status: 422 });
      const legs = deriveLegs(fwd.quote.amountPaise, mods.method);
      shipPaise = legs.totalPaise;
      shipMeta = {
        method: mods.method,
        mode,
        weightGrams,
        originPincode: origin,
        destinationPincode: pin,
        pickupPaise: legs.pickupPaise,
        returnPaise: legs.returnPaise,
        totalPaise: shipPaise,
      };
      totals.shipping = shipPaise;
      totals.total += shipPaise;
    }

    // Mixed carts are allowed: fixed-price work is charged now, quote items stay pending.
    const quoteOnly = totals.subtotal === 0 && totals.hasQuotes;
    if (!quoteOnly && totals.total <= 0) {
      return NextResponse.json({ error: "Invalid order amount" }, { status: 400 });
    }

    const { profile } = await getCurrentAuth();
    const orderNumber = generateOrderNumber();

    // ── Persist saved address for logged-in customers (first one = default) ──
    if (profile && cfg.saveAddress) {
      const existingCount = await prisma.address.count({ where: { profileId: profile.id } });
      await prisma.address.create({
        data: {
          profileId: profile.id,
          label: "Home",
          streetAddress: cfg.shippingAddress.streetAddress,
          apartment: cfg.shippingAddress.addressLine2 || null,
          city: cfg.shippingAddress.city,
          state: cfg.shippingAddress.state,
          postalCode: cfg.shippingAddress.postalCode,
          country: cfg.shippingAddress.country || "India",
          phone: cfg.customer.phone,
          isDefault: existingCount === 0,
        },
      });
    }

    // ── Coupon: validated server-side against the authoritative subtotal ────
    let discountAmount = 0;
    let couponEligible: CouponEligible | null = null;
    if (parsed.data.couponCode) {
      const res = await validateCoupon(parsed.data.couponCode, totals.subtotal, {
        profileId: profile?.id ?? null,
        email: cfg.customer.email,
      });
      if (!res.ok) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      discountAmount = res.coupon.discount;
      couponEligible = res.coupon;
      totals.total -= discountAmount;
      if (totals.total <= 0) {
        return NextResponse.json({ error: "Invalid order amount" }, { status: 400 });
      }
    }

    const summary = {
      deviceType: cfg.deviceType,
      brand: cfg.brand,
      model: cfg.model,
      layout: cfg.layout ?? null,
      switchModel: cfg.switchModel ?? null,
      switchQuantity: cfg.switchQuantity,
      stabilizerQuantity: cfg.stabilizerQuantity,
      keycapsIncluded: cfg.keycapsIncluded,
      hasQuotes: totals.hasQuotes,
      services: totals.lines.map((l) => ({
        serviceId: l.serviceId,
        serviceName: l.serviceName,
        slug: l.slug,
        unit: l.unit,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
        priceText: l.priceText,
        isQuote: l.isQuote,
      })),
      ...(cfg.contactNote ? { contactNote: cfg.contactNote } : {}),
      ...(shipMeta ? { modsShipping: shipMeta } : {}),
    };

    const street = [cfg.shippingAddress.streetAddress, cfg.shippingAddress.addressLine2]
      .filter(Boolean)
      .join(", ");

    let rzpOrderId: string | null = null;
    if (!quoteOnly) {
      const razorpay = getRazorpay();
      if (!razorpay) {
        return NextResponse.json(
          { error: "Online payments are temporarily unavailable. Please submit an inquiry instead." },
          { status: 503 }
        );
      }
      const rzpOrder = await razorpay.orders.create({
        amount: totals.total, // server-calculated paise
        currency: "INR",
        receipt: orderNumber,
        notes: { orderNumber, type: "SERVICE", customerEmail: cfg.customer.email },
      });
      rzpOrderId = rzpOrder.id;
    }

    const order = await prisma.order.create({
      data: {
        orderNumber,
        type: "SERVICE",
        status: quoteOnly ? "ORDER_RECEIVED" : "PAYMENT_PENDING",
        paymentStatus: "PENDING",
        profileId: profile?.id ?? null,
        customerName,
        customerEmail: cfg.customer.email,
        customerPhone: cfg.customer.phone,
        subtotal: totals.subtotal,
        shipping: totals.shipping,
        discount: discountAmount,
        tax: 0,
        total: totals.total,
        currency: "INR",
        ...(shipMeta
          ? {
              shippingMode: shipMeta.mode,
              shippingWeightGrams: shipMeta.weightGrams,
              shippingOriginPincode: shipMeta.originPincode,
              shippingDestinationPincode: shipMeta.destinationPincode,
            }
          : {}),
        ...(couponEligible
          ? couponOrderCreateData(couponEligible, discountAmount, {
              profileId: profile?.id ?? null,
              email: cfg.customer.email,
            })
          : {}),
        summary,
        ...(rzpOrderId ? { billingDetails: { razorpayOrderId: rzpOrderId, razorpayOrderAmount: totals.total } } : {}),
        services: {
          create: totals.lines.map((l) => ({
            serviceId: l.serviceId,
            name: l.serviceName,
            slug: l.slug,
            unit: l.unit,
            unitPrice: l.unitPrice ?? 0, // snapshot — later price edits never touch history
            quantity: l.quantity,
            lineTotal: l.lineTotal ?? 0, // quote items persist as 0 until quoted
          })),
        },
        shippingAddress: {
          create: {
            label: "Shipping",
            streetAddress: street,
            city: cfg.shippingAddress.city,
            state: cfg.shippingAddress.state,
            postalCode: cfg.shippingAddress.postalCode,
            country: cfg.shippingAddress.country || "India",
            phone: cfg.customer.phone,
          },
        },
        timeline: {
          create: {
            status: quoteOnly ? "ORDER_RECEIVED" : "PAYMENT_PENDING",
            note: quoteOnly
              ? "Quote request submitted — final pricing after inspection."
              : `Service order created${rzpOrderId ? ` · Razorpay order ${rzpOrderId}` : ""}.`,
          },
        },
      },
    });

    await syncTrackingCache(order.id);

    if (couponEligible) await incrementCouponUsage(couponEligible.couponId);

    if (quoteOnly) {
      return NextResponse.json({ orderNumber, orderId: order.id, requiresQuote: true });
    }

    return NextResponse.json({
      orderNumber,
      orderId: order.id,
      razorpayOrderId: rzpOrderId,
      amount: totals.total,
      currency: "INR",
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Create service order error:", error);
    return NextResponse.json({ error: "Failed to create service order" }, { status: 500 });
  }
}
