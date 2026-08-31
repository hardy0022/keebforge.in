import type { Coupon } from "@prisma/client";

/**
 * Pure coupon evaluation — no I/O, so it is trivially unit-testable.
 * `validateCoupon` in coupons.ts loads the row then hands it to this.
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
  | { ok: true; coupon: CouponEligible }
  | { ok: false; error: string };

/**
 * Validate an already-loaded coupon against a subtotal and usage counters,
 * returning either the computed discount or a user-facing error.
 */
export function evaluateCoupon(
  coupon: Coupon,
  subtotalPaise: number,
  opts: { usageCount: number; perCustomerUsage: number }
): CouponResult {
  if (!coupon.active) return { ok: false, error: "This coupon is no longer active." };

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
    if (coupon.maxDiscount != null) discount = Math.min(discount, coupon.maxDiscount);
  } else {
    discount = coupon.value;
  }

  discount = Math.min(discount, subtotalPaise);
  if (discount === 0) return { ok: false, error: "This coupon does not reduce your total." };

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

// ponytail: assert-based self-check, run with `npm run check:coupons`.
if (process.argv[1]?.endsWith("coupon-eval.ts")) {
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

  ok(evaluateCoupon(base({}), 10000, { usageCount: 0, perCustomerUsage: 0 }).ok === true, "percent applies");
  const p10 = evaluateCoupon(base({}), 10000, { usageCount: 0, perCustomerUsage: 0 });
  ok(p10.ok && p10.coupon.discount === 1000, "10% of 10000 = 1000");

  const capped = evaluateCoupon(base({ maxDiscount: 500 }), 10000, { usageCount: 0, perCustomerUsage: 0 });
  ok(capped.ok && capped.coupon.discount === 500, "maxDiscount caps discount");

  const fixed = evaluateCoupon(base({ type: "FIXED", value: 2500 }), 10000, { usageCount: 0, perCustomerUsage: 0 });
  ok(fixed.ok && fixed.coupon.discount === 2500, "fixed discount");

  const overSubtle = evaluateCoupon(base({ type: "FIXED", value: 20000 }), 5000, { usageCount: 0, perCustomerUsage: 0 });
  ok(overSubtle.ok && overSubtle.coupon.discount === 5000, "discount never exceeds subtotal");

  ok(evaluateCoupon(base({ minOrder: 15000 }), 10000, { usageCount: 0, perCustomerUsage: 0 }).ok === false, "min order rejected");

  ok(evaluateCoupon(base({ active: false }), 10000, { usageCount: 0, perCustomerUsage: 0 }).ok === false, "inactive rejected");

  ok(
    evaluateCoupon(base({ expiresAt: new Date(Date.now() - 1000) }), 10000, { usageCount: 0, perCustomerUsage: 0 }).ok === false,
    "expired rejected"
  );
  ok(
    evaluateCoupon(base({ startsAt: new Date(Date.now() + 86400000) }), 10000, { usageCount: 0, perCustomerUsage: 0 }).ok === false,
    "not-yet-started rejected"
  );

  ok(
    evaluateCoupon(base({ usageLimit: 2 }), 10000, { usageCount: 2, perCustomerUsage: 0 }).ok === false,
    "usage limit rejected"
  );
  ok(
    evaluateCoupon(base({ perCustomerLimit: 1 }), 10000, { usageCount: 0, perCustomerUsage: 1 }).ok === false,
    "per-customer limit rejected"
  );

  ok(evaluateCoupon(base({}), 0, { usageCount: 0, perCustomerUsage: 0 }).ok === false, "zero subtotal rejected");

  console.log("coupon-eval self-check passed");
}
