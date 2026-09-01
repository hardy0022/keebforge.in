import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAuth } from "@/lib/auth";
import { availableQuantity, getCartWithItems } from "@/lib/cart";
import { configSnapshot, resolveConfiguredPrice } from "@/lib/product-options";
import {
  calculateShipping,
  chargeableWeightGrams,
  DEFAULT_SHIPPING_MODE,
  enabledShippingModes,
  isFreeShipping,
  quoteFingerprint,
  toShippingMode,
} from "@/lib/shipping";
import { validateCoupon, couponOrderCreateData, incrementCouponUsage, type CouponEligible } from "@/lib/coupons";
import { Prisma } from "@prisma/client";
import Razorpay from "razorpay";

export const dynamic = "force-dynamic";

/**
 * Final product-order creation. The browser supplies ONLY the delivery
 * address (+ optional save flag) — prices, quantities, subtotal, weight and
 * shipping are all derived from the SERVER-SIDE cart and live catalog data.
 */

const addressSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  lastName: z.string().trim().min(1, "Last name is required.").max(80),
  streetAddress: z.string().trim().min(1, "Address is required.").max(300),
  apartment: z.string().trim().max(120).optional(),
  city: z.string().trim().min(1, "City is required.").max(100),
  state: z.string().trim().min(1, "State is required.").max(100),
  postalCode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code."),
  phone: z
    .string()
    .trim()
    .min(10, "Enter a valid phone number.")
    .max(15)
    .regex(/^\+?[0-9\s-]{10,15}$/, "Enter a valid phone number."),
});

const billingSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required.").max(160),
  addressLine1: z.string().trim().min(1, "Address is required.").max(300),
  addressLine2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(1, "City is required.").max(100),
  state: z.string().trim().min(1, "State is required.").max(100),
  pinCode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code."),
  phone: z.string().trim().min(10, "Enter a valid phone number.").max(15),
});

const bodySchema = z.object({
  shippingAddress: addressSchema,
  email: z.string().trim().email("Enter a valid email address.").optional(),
  saveAddress: z.boolean().optional(),
  mode: z.string().optional(),
  couponCode: z.string().trim().max(40).optional(),
  billingSameAsShipping: z.boolean().optional(),
  billingAddress: billingSchema.optional(),
});

/** Shipping-mode error taxonomy mapped to HTTP status. */
function shipErrorStatus(errorCode: string): number {
  if (errorCode === "PINCODE_UNAVAILABLE" || errorCode === "MISSING_SHIPPING_CONFIGURATION") return 422;
  if (errorCode === "RATE_LIMITED") return 429;
  return 502;
}

function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay credentials not configured");
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

export async function POST(req: NextRequest) {
  try {
    // Guests may order — the address travels with the order, not the account.
    const { user, profile } = await getCurrentAuth();

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid delivery details." }, { status: 400 });
    }
    const { shippingAddress: addr, saveAddress } = parsed.data;
    const billingAddr = parsed.data.billingAddress;
    const requestedModeRaw = parsed.data.mode == null ? DEFAULT_SHIPPING_MODE : toShippingMode(parsed.data.mode);
    if (!requestedModeRaw || !enabledShippingModes().includes(requestedModeRaw)) {
      return NextResponse.json({ error: "Invalid shipping method." }, { status: 400 });
    }
    const shippingMode = requestedModeRaw;

    const email = user?.email ?? parsed.data.email;
    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    // ── Server-side cart is the single source of truth ──────────────────────
    const cart = await getCartWithItems();
    const items = cart?.items ?? [];
    if (items.length === 0) {
      return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
    }

    const productIds = items.map((i) => i.productId);
    const variantIds = items.map((i) => i.variantId).filter((v): v is string => Boolean(v));
    const [products, variants] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: productIds } },
        include: {
          images: { where: { active: true }, orderBy: [{ primary: "desc" }, { sortOrder: "asc" }], take: 1 },
          optionGroups: {
            where: { enabled: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            include: { options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
          },
        },
      }),
      prisma.productVariant.findMany({ where: { id: { in: variantIds } } }),
    ]);
    const productMap = new Map(products.map((p) => [p.id, p]));
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    let subtotal = 0;
    const weightRows: {
      quantity: number;
      weight: number | null;
      variantWeight: number | null;
      lengthCm: number | null;
      widthCm: number | null;
      heightCm: number | null;
    }[] = [];
    const orderItems: Array<{
      productId: string;
      name: string;
      sku: string | null;
      unitPrice: number;
      quantity: number;
      lineTotal: number;
      imageUrl: string | null;
      variantInfo?: Prisma.InputJsonValue;
    }> = [];

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product || !product.active) {
        return NextResponse.json({ error: `${item.product.name} is no longer available.` }, { status: 400 });
      }

      let variant = null;
      let unitPrice = product.price;
      let available = availableQuantity(product.stock, product.reservedQuantity);
      let configSnapshotData: Prisma.InputJsonValue | undefined;

      const cfg = item.config as { kind?: string; optionIds?: string[] } | null;
      if (cfg?.kind === "options" && cfg.optionIds?.length) {
        const resolved = resolveConfiguredPrice(product.optionGroups, product.price, cfg.optionIds);
        if (!resolved.ok) {
          return NextResponse.json({ error: `${product.name}: ${resolved.error}` }, { status: 400 });
        }
        unitPrice = resolved.unitPrice;
        configSnapshotData = configSnapshot(resolved) as unknown as Prisma.InputJsonValue;
      } else if (item.variantId) {
        variant = variantMap.get(item.variantId);
        if (!variant || !variant.active) {
          return NextResponse.json({ error: `A selected variant is no longer available.` }, { status: 400 });
        }
        unitPrice = variant.price ?? product.price;
        available = availableQuantity(variant.stock, variant.reservedQuantity);
      }

      if (item.quantity > available) {
        return NextResponse.json({ error: `Only ${available} left in stock for ${product.name}.` }, { status: 400 });
      }

      const lineTotal = unitPrice * item.quantity;
      subtotal += lineTotal;
      weightRows.push({
        quantity: item.quantity,
        weight: product.weight,
        variantWeight: variant?.weight ?? null,
        lengthCm: product.lengthCm,
        widthCm: product.widthCm,
        heightCm: product.heightCm,
      });

      orderItems.push({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        unitPrice,
        quantity: item.quantity,
        lineTotal,
        imageUrl: product.images[0]?.url ?? null,
        ...(configSnapshotData ? { variantInfo: configSnapshotData } : {}),
        ...(variant && !configSnapshotData
          ? { variantInfo: { id: variant.id, name: variant.name, options: (variant.options ?? {}) as Prisma.InputJsonValue } }
          : {}),
      });
    }

    // ── Shipping: authoritative server-side recalculation before payment ────
    // Free rules first (threshold OR per-product); Delhivery is skipped when
    // either applies. Otherwise a FRESH provider quote is computed here — the
    // browser never supplies amounts, so stale/manipulated client quotes
    // cannot influence the charged total.
    let shippingAmount = 0;
    let shippingSnapshot: {
      provider: string;
      mode: string;
      weightGrams: number;
      originPincode: string;
      destinationPincode: string;
      quotedAt: Date;
      fingerprint: string;
    } | null = null;
    if (!isFreeShipping({ items: items.map((i) => ({ freeShipping: i.product.freeShipping })), subtotalPaise: subtotal })) {
      let weightGrams: number;
      try {
        weightGrams = chargeableWeightGrams(weightRows).weightGrams;
      } catch {
        console.error("[create-order] product(s) missing shipping weight:", weightRows.length);
        return NextResponse.json({ error: "Shipping information is unavailable for one or more products.", errorCode: "MISSING_SHIPPING_CONFIGURATION" }, { status: 422 });
      }
      const ship = await calculateShipping({
        destinationPincode: addr.postalCode,
        paymentMode: "Pre-paid", // Razorpay checkout is pre-paid only
        weightGrams,
        mode: shippingMode,
      });
      if (!ship.ok) {
        return NextResponse.json({ error: ship.message, errorCode: ship.errorCode }, { status: shipErrorStatus(ship.errorCode) });
      }
      shippingAmount = ship.quote.amountPaise;
      shippingSnapshot = {
        provider: ship.quote.provider,
        mode: ship.quote.mode,
        weightGrams: ship.quote.weightGrams,
        originPincode: ship.quote.originPincode,
        destinationPincode: ship.quote.destinationPincode,
        quotedAt: new Date(),
        fingerprint: quoteFingerprint({
          destinationPincode: addr.postalCode,
          mode: shippingMode,
          weightGrams,
          subtotalPaise: subtotal,
          itemKeys: items.map((i) => `${i.productId}:${i.variantId ?? "-"}:${i.quantity}`),
        }),
      };
      console.log(`[create-order] quote validated fp=${shippingSnapshot.fingerprint} amount=${shippingAmount}`);
    }

    // ── Coupon: validated server-side against the authoritative subtotal ────
    let discountAmount = 0;
    let couponEligible: CouponEligible | null = null;
    if (parsed.data.couponCode) {
      const res = await validateCoupon(parsed.data.couponCode, subtotal, {
        profileId: profile?.id ?? null,
        email,
      });
      if (!res.ok) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      discountAmount = res.coupon.discount;
      couponEligible = res.coupon;
    }

    const taxAmount = 0;
    const totalAmount = subtotal + shippingAmount - discountAmount + taxAmount;
    if (totalAmount <= 0) {
      return NextResponse.json({ error: "Invalid order amount" }, { status: 400 });
    }

    // ── Persist saved address BEFORE the gateway call (first one = default) ──
    if (profile && saveAddress) {
      const existingCount = await prisma.address.count({ where: { profileId: profile.id } });
      await prisma.address.create({
        data: {
          profileId: profile.id,
          label: "Home",
          streetAddress: addr.streetAddress,
          apartment: addr.apartment || null,
          city: addr.city,
          state: addr.state,
          postalCode: addr.postalCode,
          country: "India",
          phone: addr.phone,
          isDefault: existingCount === 0,
        },
      });
    }

    const orderNumber = `KF${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        type: "PRODUCT",
        status: "ORDER_RECEIVED",
        paymentStatus: "PENDING",
        profileId: profile?.id ?? null,
        customerName: [addr.firstName, addr.lastName].filter(Boolean).join(" ") || profile?.name || user?.name || "Customer",
        customerEmail: email,
        customerPhone: addr.phone,
        subtotal,
        discount: discountAmount,
        shipping: shippingAmount,
        tax: taxAmount,
        total: totalAmount,
        currency: "INR",
        ...(shippingSnapshot
          ? {
              shippingProvider: shippingSnapshot.provider,
              shippingMode: shippingSnapshot.mode,
              shippingWeightGrams: shippingSnapshot.weightGrams,
              shippingOriginPincode: shippingSnapshot.originPincode,
              shippingDestinationPincode: shippingSnapshot.destinationPincode,
              shippingQuotedAt: shippingSnapshot.quotedAt,
            }
          : {}),
        ...(couponEligible
          ? couponOrderCreateData(couponEligible, discountAmount, { profileId: profile?.id ?? null, email })
          : {}),
        items: { create: orderItems },
        shippingAddress: {
          create: {
            label: "Delivery",
            streetAddress: addr.streetAddress,
            apartment: addr.apartment || null,
            city: addr.city,
            state: addr.state,
            postalCode: addr.postalCode,
            country: "India",
            phone: addr.phone,
          },
        },
      },
    });

    const razorpay = getRazorpay();
    const rzpOrder = await razorpay.orders.create({
      amount: totalAmount,
      currency: "INR",
      receipt: orderNumber,
      notes: {
        orderId: order.id,
        orderNumber,
        customerEmail: email,
      },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        billingDetails: {
          razorpayOrderId: rzpOrder.id,
          razorpayOrderAmount: rzpOrder.amount,
          ...(shippingSnapshot ? { shippingFingerprint: shippingSnapshot.fingerprint } : {}),
          ...(billingAddr
            ? {
                billingAddress: {
                  fullName: billingAddr.fullName,
                  addressLine1: billingAddr.addressLine1,
                  addressLine2: billingAddr.addressLine2 ?? null,
                  city: billingAddr.city,
                  state: billingAddr.state,
                  pinCode: billingAddr.pinCode,
                  phone: billingAddr.phone,
                },
              }
            : {}),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    if (couponEligible) await incrementCouponUsage(couponEligible.couponId);

    return NextResponse.json({
      orderId: order.id,
      orderNumber,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID,
      customerName: order.customerName,
      customerEmail: email,
      customerPhone: addr.phone,
    });
  } catch (error) {
    console.error("Create Razorpay order error:", error);
    return NextResponse.json({ error: "Failed to create payment order" }, { status: 500 });
  }
}
