import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAuth } from "@/lib/auth";
import { syncTrackingCache } from "@/lib/tracking";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * Razorpay handshake verification.
 *
 * Guests may pay, so this endpoint does NOT require a session. Integrity comes
 * from the HMAC signature (order|payment signed with the key secret) plus the
 * stored razorpayOrderId binding on the order — not from authentication.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = body as {
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
      orderId?: string;
    };

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      return NextResponse.json({ error: "Missing payment verification data" }, { status: 400 });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return NextResponse.json({ error: "Payments are not configured" }, { status: 503 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Idempotency: replayed verifications are a no-op success.
    if (order.paymentStatus === "PAID" && order.payments.some((p) => p.razorpayPaymentId === razorpay_payment_id)) {
      return NextResponse.json({ success: true, alreadyProcessed: true });
    }

    // The payment must belong to the Razorpay order we created for THIS order.
    const billing = (order.billingDetails ?? {}) as { razorpayOrderId?: string };
    if (!billing.razorpayOrderId || billing.razorpayOrderId !== razorpay_order_id) {
      return NextResponse.json({ error: "Payment does not match this order" }, { status: 400 });
    }

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await prisma.$transaction([
        prisma.payment.create({
          data: {
            orderId: order.id,
            amount: order.total,
            currency: "INR",
            status: "FAILED",
            method: "razorpay",
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
            failureReason: "Signature verification failed",
          },
        }),
        prisma.orderTimeline.create({
          data: { orderId: order.id, status: "PAYMENT_PENDING", note: `Payment signature verification failed (${razorpay_payment_id}).` },
        }),
      ]);
      return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
    }

    // Claim-by-email: associate a guest order with the account when the emails match.
    let profileId = order.profileId;
    if (!profileId) {
      const { profile } = await getCurrentAuth();
      const linked =
        (profile && profile.id) ||
        (await prisma.profile.findUnique({ where: { email: order.customerEmail } }))?.id ||
        null;
      profileId = linked;
    }

    await prisma.$transaction([
      prisma.payment.create({
        data: {
          orderId: order.id,
          amount: order.total,
          currency: "INR",
          status: "PAID",
          method: "razorpay",
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          paidAt: new Date(),
        },
      }),
      prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "PAID",
          status: "PAYMENT_RECEIVED",
          ...(profileId ? { profileId } : {}),
        },
      }),
      prisma.orderTimeline.create({
        data: { orderId: order.id, status: "PAYMENT_RECEIVED", note: `Payment captured via Razorpay (${razorpay_payment_id}).` },
      }),
    ]);

    await syncTrackingCache(order.id);

    return NextResponse.json({ success: true, orderNumber: order.orderNumber });
  } catch (error) {
    console.error("Verify payment error:", error);
    return NextResponse.json({ error: "Payment verification failed" }, { status: 500 });
  }
}
