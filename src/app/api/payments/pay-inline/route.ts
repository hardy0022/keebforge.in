import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentAuth } from "@/lib/auth/session";
import { ensureRazorpayCustomer } from "@/lib/payments/razorpay-customer";
import { readPayCookie } from "@/lib/payments/order-access";
import { patchBillingDetails as patchBilling } from "@/lib/payments/billing-details";
import {
  startInlinePayment,
  type InlinePaymentDeps,
  type InlinePaymentOrder,
} from "@/lib/payments/pay-inline-core";
import {
  checkRateLimit,
  clientIp,
  rateLimitResponse,
} from "@/lib/payments/rate-limit";
import { readJsonBody } from "@/lib/http/read-json-body";
import {
  PREVIEW_OPERATION_DISABLED_MESSAGE,
  previewOperationsAllowed,
} from "@/lib/config/deployment";
import { JSON_BODY_LIMIT_SMALL } from "@/lib/utils/limits";
import Razorpay from "razorpay";

export const dynamic = "force-dynamic";

/** Per client, per minute — each success mints a Razorpay order + customer. */
const RATE_LIMIT = { limit: 30, windowMs: 60_000 };

/**
 * Opens a Razorpay session for an EXISTING order that's still unpaid (e.g. the
 * customer pays from the post-checkout page after a cancelled first attempt).
 *
 * Access requires proof of entitlement to this specific order: the HttpOnly
 * payment cookie, or a session that owns the order. An order number alone is NOT
 * sufficient — it is a public identifier, present in emails, /track-order and
 * /order/success URLs. Because the credential is a cookie and never a body
 * field, cross-site callers cannot present it (SameSite=Lax).
 *
 * Authorization runs inside startInlinePayment BEFORE any customer data is read
 * out, any Razorpay customer is created, any Razorpay order is created, and any
 * billingDetails write happens. The response carries only what the Razorpay
 * client needs to open the modal — no customer PII.
 */
export async function POST(req: NextRequest) {
  // Defense in depth: opening a Razorpay session can create a customer + order
  // against shared credentials, so it is refused in Preview before any work.
  if (!previewOperationsAllowed()) {
    return NextResponse.json(
      { error: PREVIEW_OPERATION_DISABLED_MESSAGE },
      { status: 503 },
    );
  }
  try {
    const limit = checkRateLimit(
      `pay-inline:ip:${clientIp(req)}`,
      RATE_LIMIT,
    );
    if (!limit.allowed) return rateLimitResponse(limit, "pay-inline");

    const bodyRead = await readJsonBody<{ orderNumber?: string }>(
      req,
      JSON_BODY_LIMIT_SMALL,
    );
    if (!bodyRead.ok) {
      return NextResponse.json(
        { error: "Invalid request." },
        { status: bodyRead.status },
      );
    }
    const orderNumber =
      typeof bodyRead.data?.orderNumber === "string" &&
      bodyRead.data.orderNumber.length <= 40
        ? bodyRead.data.orderNumber
        : undefined;
    const result = await startInlinePayment(makeDeps(), {
      orderNumber,
      // Read from the HttpOnly cookie, never from the request body — a
      // client-supplied token would be replayable from any origin.
      capabilityToken: await readPayCookie(),
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    console.error("[pay-inline] failed:", e);
    return NextResponse.json(
      { error: "Failed to start payment. Please try again." },
      { status: 500 },
    );
  }
}

function makeDeps(): InlinePaymentDeps {
  const keyId =
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? null;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  const razorpay = () => {
    if (!keyId || !keySecret) throw new Error("Razorpay is not configured");
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
  };

  return {
    keyId: keyId && keySecret ? keyId : null,

    async findOrder(orderNumber): Promise<InlinePaymentOrder | null> {
      return prisma.order.findUnique({
        where: { orderNumber },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          paymentStatus: true,
          profileId: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
          billingDetails: true,
          payments: {
            // refundedAmount is required: the outstanding balance is computed from
            // NET collected, and a payment with money returned against it is not
            // worth its face value.
            select: { amount: true, status: true, refundedAmount: true },
          },
        },
      });
    },

    async currentProfileId() {
      const { profile } = await getCurrentAuth();
      return profile?.id ?? null;
    },

    async ensureCustomer(order) {
      const billing = (order.billingDetails ?? {}) as Record<string, unknown>;
      const profile = order.profileId
        ? await prisma.profile.findUnique({
            where: { id: order.profileId },
            select: { id: true, razorpayCustomerId: true },
          })
        : null;
      return ensureRazorpayCustomer(razorpay(), {
        profile,
        existingId:
          typeof billing.razorpayCustomerId === "string"
            ? billing.razorpayCustomerId
            : null,
        name: order.customerName,
        email: order.customerEmail,
        contact: order.customerPhone,
      });
    },

    async createRazorpayOrder(args) {
      const created = await razorpay().orders.create({
        amount: args.amount,
        currency: "INR",
        receipt: args.receipt,
        notes: {
          orderId: args.orderId,
          orderNumber: args.orderNumber,
          source: "pay-inline",
        },
      });
      return {
        id: created.id,
        // Razorpay types amount as string | number; the client needs paise as a
        // number. Echo back the server-computed outstanding rather than trusting
        // a string here, so the client can never be pointed at a wrong amount.
        amount: args.amount,
        currency: created.currency,
      };
    },

    async patchBillingDetails(orderId, patch) {
      await patchBilling(orderId, patch);
    },
  };
}