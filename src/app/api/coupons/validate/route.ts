import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAuth } from "@/lib/auth";
import { validateCoupon } from "@/lib/coupons";

export const dynamic = "force-dynamic";

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
    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const { user, profile } = await getCurrentAuth();
    const res = await validateCoupon(parsed.data.code, parsed.data.subtotalPaise, {
      profileId: profile?.id ?? null,
      email: user?.email ?? null,
    });

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
    return NextResponse.json({ ok: false, error: "Could not validate coupon." }, { status: 500 });
  }
}
