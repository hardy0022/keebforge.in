import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  PAY_COOKIE,
  createOrderCapability,
  hashOrderCapability,
  normalizeOrderNumber,
  readCapabilityParam,
  verifyOrderExchange,
} from "@/lib/payments/order-capability";
import { claimExchangeRedemption } from "@/lib/payments/billing-details";
import { payCookieOptions } from "@/lib/payments/order-access";

export const dynamic = "force-dynamic";

/**
 * Redeems a short-lived exchange code (from the confirmation-email link) for the
 * order-scoped payment capability, delivered as an HttpOnly cookie.
 *
 * POST-only, on purpose. A GET would consume the code from a prefetch, a link
 * scanner or an antivirus URL check; requiring the customer's own click is what
 * makes "single use" mean something.
 *
 * The code is exchanged for a *fresh* capability rather than promoted to one
 * itself. That keeps the property that matters: the value which appeared in a
 * URL is never a value the payment API accepts, even in the same browser.
 *
 * Every failure — unknown order, wrong code, expired code, already redeemed —
 * returns the identical status and body, so this cannot be used to probe which
 * orders exist or which codes were real.
 */
export async function POST(req: NextRequest) {
  const invalid = NextResponse.json(
    { error: "We couldn't verify your access to this order." },
    { status: 404 },
  );

  const body = await req.json().catch(() => null);
  const orderNumber = normalizeOrderNumber(body?.orderNumber);
  const code = readCapabilityParam(body?.code);
  if (!orderNumber || !code) return invalid;

  try {
    const order = await prisma.order.findUnique({
      where: { orderNumber, isDeleted: false },
      select: { id: true, orderNumber: true, billingDetails: true },
    });
    if (!order) return invalid;
    if (!verifyOrderExchange(code, order.billingDetails)) return invalid;

    const capability = createOrderCapability();

    // One guarded UPDATE swaps the code hash for the new capability and flips the
    // state to redeemed. The guard repeats every condition `verifyOrderExchange`
    // checked, in the database, so redemption is atomic: two simultaneous
    // redemptions both pass the read above but only the first matches here.
    //
    // Writing just the three exchange paths — rather than replacing the whole
    // document from the snapshot read above — is what keeps this from clobbering
    // a concurrent `patchBillingDetails` of Razorpay fields, and equally keeps a
    // concurrent pay-inline write from resurrecting this code.
    const claimed = await claimExchangeRedemption(
      order.id,
      hashOrderCapability(code),
      capability.hash,
    );
    if (!claimed) return invalid;

    const res = NextResponse.json({ ok: true, orderNumber: order.orderNumber });
    res.cookies.set(PAY_COOKIE, capability.token, payCookieOptions());
    return res;
  } catch (e) {
    console.error("[pay-exchange] failed:", e);
    return NextResponse.json(
      { error: "We couldn't verify your access to this order." },
      { status: 500 },
    );
  }
}