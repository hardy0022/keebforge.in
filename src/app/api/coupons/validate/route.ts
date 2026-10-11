import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAuth } from "@/lib/auth/session";
import { validateCoupon } from "@/lib/checkout/coupons";
import {
  checkRateLimit,
  clientIp,
  rateLimitResponse,
} from "@/lib/payments/rate-limit";
import { readJsonBody } from "@/lib/http/read-json-body";

export const dynamic = "force-dynamic";

const RATE_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };

const bodySchema = z.object({
  code: z.string().trim().max(40),
  subtotalPaise: z.number().int().min(0),
});

/**
 * Checkout-time coupon preview. Validates against the provided subtotal and
 * the signed-in customer's usage. This is preview-only — the authoritative
 * validation + discount application happens at order creation.
 */
export async function POST(req: NextRequest) {
  try {
    const ipLimit = checkRateLimit(
      `coupons:validate:ip:${clientIp(req)}`,
      RATE_LIMIT,
    );
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit, "coupons");

    const bodyRead = await readJsonBody(req, 8 * 1024);
    if (!bodyRead.ok) {
      return NextResponse.json(
        { error: "Invalid request." },
        { status: bodyRead.status },
      );
    }
    const parsed = bodySchema.safeParse(bodyRead.data ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const { user, profile } = await getCurrentAuth();
    // Signed-in hammering is also capped per-profile, so rotating IPs cannot
    // dodge the budget on an authenticated session.
    if (profile || user) {
      const profileLimit = checkRateLimit(
        `coupons:validate:account:${user?.id ?? profile?.id ?? "anon"}`,
        RATE_LIMIT,
      );
      if (!profileLimit.allowed)
        return rateLimitResponse(profileLimit, "coupons");
    }

    const res = await validateCoupon(
      parsed.data.code,
      parsed.data.subtotalPaise,
      {
        profileId: profile?.id ?? null,
        email: user?.email ?? null,
      },
    );

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error });
    }

    return NextResponse.json({
      ok: true,
      code: res.coupon.code,
      discount: res.coupon.discount,
      type: res.coupon.type,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Could not validate coupon." },
      { status: 500 },
    );
  }
}
