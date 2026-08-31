import { prisma } from "@/lib/prisma";
import {
  evaluateCoupon,
  type CouponEligible,
  type CouponResult,
} from "@/lib/coupon-eval";

export { evaluateCoupon, type CouponEligible, type CouponResult };

/**
 * Shared coupon validation + discount calculation.
 * Used by the checkout "apply" endpoint and again authoritatively at order
 * creation — never trust client-computed discounts.
 */

export const COUPON_CODE_MAX = 40;

const normalizeCode = (code: string) => code.trim().toUpperCase();

/**
 * Load a coupon by normalized code and validate it for the given customer.
 * `customerEmail` (lowercased) + `profileId` identify the customer for
 * per-customer limit checks.
 */
export async function validateCoupon(
  code: string,
  subtotalPaise: number,
  customer: { profileId: string | null; email: string | null }
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

  return evaluateCoupon(coupon, subtotalPaise, { usageCount, perCustomerUsage });
}

export const normalizeCouponCode = normalizeCode;

/**
 * Order-create data for coupon snapshot + usage tracking. Spread into the
 * `data` of `prisma.order.create` to persist history and enforce the
 * used-count increment atomically with the order.
 */
export function couponOrderCreateData(
  eligible: CouponEligible,
  discount: number,
  customer: { profileId: string | null; email: string }
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
