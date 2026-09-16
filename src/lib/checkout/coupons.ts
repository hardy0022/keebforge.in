import { prisma } from "@/lib/db/prisma";
import type { Coupon } from "@prisma/client";

/**
 * Shared coupon validation + discount calculation.
 * Used by the checkout "apply" endpoint and again authoritatively at order
 * creation — never trust client-computed discounts.
 */

export type CouponEligible = {
  couponId: string;
  code: string;
  name: string;
  type: "PERCENT" | "FIXED";
  value: number;
  discount: number; // paise actually applied
};

export type CouponResult =
  { ok: true; coupon: CouponEligible } | { ok: false; error: string };

const normalizeCode = (code: string) => code.trim().toUpperCase();

/**
 * Validate an already-loaded coupon against a subtotal and usage counters,
 * returning either the computed discount or a user-facing error.
 */
export function evaluateCoupon(
  coupon: Coupon,
  subtotalPaise: number,
  opts: { usageCount: number; perCustomerUsage: number },
): CouponResult {
  if (!coupon.active)
    return { ok: false, error: "This coupon is no longer active." };

  const now = new Date();
  if (coupon.expiresAt && coupon.expiresAt < now)
    return { ok: false, error: "This coupon has expired." };
  if (coupon.startsAt && coupon.startsAt > now)
    return { ok: false, error: "This coupon is not active yet." };

  if (coupon.minOrder != null && subtotalPaise < coupon.minOrder)
    return {
      ok: false,
      error: `Add at least ${(coupon.minOrder / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" })} worth of items to use this coupon.`,
    };

  let discount: number;
  if (coupon.type === "PERCENT") {
    discount = Math.floor((subtotalPaise * coupon.value) / 100);
    if (coupon.maxDiscount != null)
      discount = Math.min(discount, coupon.maxDiscount);
  } else {
    discount = coupon.value;
  }

  discount = Math.min(discount, subtotalPaise);
  if (discount === 0)
    return { ok: false, error: "This coupon does not reduce your total." };

  if (coupon.usageLimit != null && opts.usageCount >= coupon.usageLimit)
    return { ok: false, error: "This coupon has reached its usage limit." };

  if (opts.perCustomerUsage > 0)
    return { ok: false, error: "You have already used this coupon." };

  return {
    ok: true,
    coupon: {
      couponId: coupon.id,
      code: coupon.code,
      name: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discount,
    },
  };
}

/**
 * Load a coupon by normalized code and validate it for the given customer.
 * `customerEmail` (lowercased) + `profileId` identify the customer for
 * per-customer limit checks.
 */
export async function validateCoupon(
  code: string,
  subtotalPaise: number,
  customer: { profileId: string | null; email: string | null },
): Promise<CouponResult> {
  const clean = normalizeCode(code);
  if (!clean) return { ok: false, error: "Enter a coupon code." };

  const coupon = await prisma.coupon.findUnique({
    where: { code: clean },
  });
  if (!coupon) return { ok: false, error: "That coupon code isn't valid." };

  const email = (customer.email ?? "").toLowerCase();
  const usageCount = coupon.usedCount;

  let perCustomerUsage = 0;
  if (coupon.perCustomerLimit != null) {
    perCustomerUsage = await prisma.couponUsage.count({
      where: {
        couponId: coupon.id,
        AND: [
          customer.profileId ? { profileId: customer.profileId } : {},
          email ? { customerEmail: email } : {},
        ].filter((c) => Object.keys(c).length > 0),
      },
    });
  }

  return evaluateCoupon(coupon, subtotalPaise, {
    usageCount,
    perCustomerUsage,
  });
}

/**
 * Order-create data for coupon snapshot + usage tracking. Spread into the
 * `data` of `prisma.order.create` to persist history and enforce the
 * used-count increment atomically with the order.
 */
export function couponOrderCreateData(
  eligible: CouponEligible,
  discount: number,
  customer: { profileId: string | null; email: string },
) {
  return {
    couponId: eligible.couponId,
    couponCode: eligible.code,
    couponDiscount: discount,
    couponUsage: {
      create: {
        coupon: { connect: { id: eligible.couponId } },
        profileId: customer.profileId,
        customerEmail: customer.email.toLowerCase(),
        discountPaise: discount,
      },
    },
  };
}

/**
 * Post-order usedCount increment. Not transactional with order creation — the
 * authoritative audit is the CouponUsage row (created atomically with the
 * order); this denormalized counter can lag by one under a race.
 * ponytail: acceptable ceiling for an aggregate counter.
 */
export async function incrementCouponUsage(couponId: string) {
  try {
    await prisma.coupon.update({
      where: { id: couponId },
      data: { usedCount: { increment: 1 } },
    });
  } catch {
    // best-effort; the CouponUsage row already records the redemption
  }
}

// ponytail: assert-based self-check, run with `npm run check:coupons`.
if (process.argv[1]?.endsWith("coupons.ts")) {
  const ok = (cond: boolean, msg: string) => {
    if (!cond) {
      console.error(`FAIL: ${msg}`);
      process.exit(1);
    }
    console.log(`ok: ${msg}`);
  };

  const base = (p: Partial<Coupon>): Coupon => ({
    id: "c1",
    code: "TEST10",
    type: "PERCENT",
    value: 10,
    minOrder: null,
    maxDiscount: null,
    active: true,
    usageLimit: null,
    usedCount: 0,
    perCustomerLimit: null,
    startsAt: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...p,
  });

  ok(
    evaluateCoupon(base({}), 10000, { usageCount: 0, perCustomerUsage: 0 })
      .ok === true,
    "percent applies",
  );
  const p10 = evaluateCoupon(base({}), 10000, {
    usageCount: 0,
    perCustomerUsage: 0,
  });
  ok(p10.ok && p10.coupon.discount === 1000, "10% of 10000 = 1000");

  const capped = evaluateCoupon(base({ maxDiscount: 500 }), 10000, {
    usageCount: 0,
    perCustomerUsage: 0,
  });
  ok(capped.ok && capped.coupon.discount === 500, "maxDiscount caps discount");

  const fixed = evaluateCoupon(base({ type: "FIXED", value: 2500 }), 10000, {
    usageCount: 0,
    perCustomerUsage: 0,
  });
  ok(fixed.ok && fixed.coupon.discount === 2500, "fixed discount");

  const overSubtle = evaluateCoupon(
    base({ type: "FIXED", value: 20000 }),
    5000,
    { usageCount: 0, perCustomerUsage: 0 },
  );
  ok(
    overSubtle.ok && overSubtle.coupon.discount === 5000,
    "discount never exceeds subtotal",
  );

  ok(
    evaluateCoupon(base({ minOrder: 15000 }), 10000, {
      usageCount: 0,
      perCustomerUsage: 0,
    }).ok === false,
    "min order rejected",
  );

  ok(
    evaluateCoupon(base({ active: false }), 10000, {
      usageCount: 0,
      perCustomerUsage: 0,
    }).ok === false,
    "inactive rejected",
  );

  ok(
    evaluateCoupon(base({ expiresAt: new Date(Date.now() - 1000) }), 10000, {
      usageCount: 0,
      perCustomerUsage: 0,
    }).ok === false,
    "expired rejected",
  );
  ok(
    evaluateCoupon(base({ startsAt: new Date(Date.now() + 86400000) }), 10000, {
      usageCount: 0,
      perCustomerUsage: 0,
    }).ok === false,
    "not-yet-started rejected",
  );

  ok(
    evaluateCoupon(base({ usageLimit: 2 }), 10000, {
      usageCount: 2,
      perCustomerUsage: 0,
    }).ok === false,
    "usage limit rejected",
  );
  ok(
    evaluateCoupon(base({ perCustomerLimit: 1 }), 10000, {
      usageCount: 0,
      perCustomerUsage: 1,
    }).ok === false,
    "per-customer limit rejected",
  );

  ok(
    evaluateCoupon(base({}), 0, { usageCount: 0, perCustomerUsage: 0 }).ok ===
      false,
    "zero subtotal rejected",
  );

  console.log("coupons self-check passed");
}