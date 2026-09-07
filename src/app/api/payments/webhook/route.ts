import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import crypto from "crypto";
import { formatINR } from "@/lib/utils/money";

export const dynamic = "force-dynamic";

/**
 * Razorpay payment webhook.
 *
 * Security: every request is authenticated with an HMAC-SHA256 signature over
 * the RAW request body using RAZORPAY_WEBHOOK_SECRET. The body is consumed
 * as text and hashed BEFORE any JSON parsing — re-serializing the payload
 * would break the signature.
 *
 * Idempotency: Razorpay retries any event that does not return 2xx, and can
 * deliver the same event twice. We therefore always answer 200 with
 * `{received:true}` even when we choose to ignore the event, and the PAID
 * transition is guarded so a captured payment can never be recorded twice
 * (see the existingPayment / isAlreadyPaid checks below).
 */
export async function POST(req: NextRequest) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("RAZORPAY_WEBHOOK_SECRET not configured");
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 },
      );
    }

    const signature = req.headers.get("x-razorpay-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const rawBody = await req.text();

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (expectedSignature !== signature) {
      console.error("Invalid webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const event = JSON.parse(rawBody);
    const payload = event.payload?.payment?.entity;

    if (!payload) {
      return NextResponse.json({ received: true });
    }

    const paymentId = payload.id;
    const orderId = payload.order_id;
    const amount = payload.amount;
    const status = payload.status;
    const method = payload.method;
    const customerId =
      typeof payload.customer_id === "string" ? payload.customer_id : null;

    const existingPayment = await prisma.payment.findUnique({
      where: { razorpayPaymentId: paymentId },
    });

    // Duplicate delivery of an event we already actioned: acknowledge and stop.
    if (existingPayment) {
      if (
        existingPayment.status === "PAID" &&
        (status === "captured" || status === "authorized")
      ) {
        return NextResponse.json({ received: true });
      }
    }

    const order = await prisma.order.findFirst({
      where: { billingDetails: { path: ["razorpayOrderId"], equals: orderId } },
      include: { payments: true },
    });

    // Ack even when the order isn't found yet: a webhook can race with order
    // creation. Returning non-2xx makes Razorpay retry, eventually timing out.
    if (!order) {
      console.warn(`Order not found for Razorpay order_id: ${orderId}`);
      return NextResponse.json({ received: true });
    }

    const orderBilling = (order.billingDetails ?? {}) as {
      razorpayCustomerId?: string;
    };
    const resolvedCustomerId =
      customerId ?? orderBilling.razorpayCustomerId ?? null;

    if (status === "captured" || status === "authorized") {
      // The PAID path must be idempotent: the order-level guard makes the whole
      // transition run at most once even if identical events arrive back-to-back.
      const isAlreadyPaid =
        existingPayment?.status === "PAID" || order.paymentStatus === "PAID";

      if (!isAlreadyPaid) {
        await prisma.$transaction(async (tx) => {
          await tx.payment.upsert({
            where: { razorpayPaymentId: paymentId },
            update: {
              status: "PAID",
              method: method ?? "razorpay",
              paidAt: new Date(),
              ...(resolvedCustomerId
                ? { razorpayCustomerId: resolvedCustomerId }
                : {}),
            },
            create: {
              orderId: order.id,
              amount: order.total,
              currency: "INR",
              status: "PAID",
              method: method ?? "razorpay",
              razorpayOrderId: orderId,
              razorpayPaymentId: paymentId,
              razorpaySignature: "",
              ...(resolvedCustomerId
                ? { razorpayCustomerId: resolvedCustomerId }
                : {}),
              paidAt: new Date(),
            },
          });

          await tx.order.update({
            where: { id: order.id },
            data: {
              paymentStatus: "PAID",
              status: "PAYMENT_RECEIVED",
            },
          });

          await tx.orderTimeline.create({
            data: {
              orderId: order.id,
              status: "PAYMENT_RECEIVED",
              note: `Payment captured via Razorpay (${paymentId})`,
            },
          });
        });
      }
    } else if (status === "failed") {
      await prisma.payment.upsert({
        where: { razorpayPaymentId: paymentId },
        update: {
          status: "FAILED",
          failureReason: payload.error_description ?? "Payment failed",
          ...(resolvedCustomerId
            ? { razorpayCustomerId: resolvedCustomerId }
            : {}),
        },
        create: {
          orderId: order.id,
          amount: order.total,
          currency: "INR",
          status: "FAILED",
          method: "razorpay",
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: "",
          ...(resolvedCustomerId
            ? { razorpayCustomerId: resolvedCustomerId }
            : {}),
          failureReason: payload.error_description ?? "Payment failed",
        },
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "FAILED" },
      });

      await prisma.orderTimeline.create({
        data: {
          orderId: order.id,
          status: "ORDER_RECEIVED",
          note: `Payment failed: ${payload.error_description ?? "Unknown reason"}`,
        },
      });
    } else if (status === "refunded") {
      const refundAmount = payload.refund_amount ?? amount;

      // refundAmount is integer paise; formatINR is the canonical display formatter.
      await prisma.payment.update({
        where: { razorpayPaymentId: paymentId },
        data: {
          status: "REFUNDED",
        },
      });

      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "REFUNDED" },
      });

      await prisma.orderTimeline.create({
        data: {
          orderId: order.id,
          status: "ORDER_RECEIVED",
          note: `Payment refunded: ${formatINR(refundAmount)}`,
        },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
