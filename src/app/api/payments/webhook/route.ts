import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("RAZORPAY_WEBHOOK_SECRET not configured");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
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

    const existingPayment = await prisma.payment.findUnique({
      where: { razorpayPaymentId: paymentId },
    });

    if (existingPayment) {
      if (existingPayment.status === "PAID" && (status === "captured" || status === "authorized")) {
        return NextResponse.json({ received: true });
      }
    }

    const order = await prisma.order.findFirst({
      where: { billingDetails: { path: ["razorpayOrderId"], equals: orderId } },
      include: { payments: true },
    });

    if (!order) {
      console.warn(`Order not found for Razorpay order_id: ${orderId}`);
      return NextResponse.json({ received: true });
    }

    if (status === "captured" || status === "authorized") {
      const isAlreadyPaid = existingPayment?.status === "PAID" || order.paymentStatus === "PAID";

      if (!isAlreadyPaid) {
        await prisma.$transaction(async (tx) => {
          await tx.payment.upsert({
            where: { razorpayPaymentId: paymentId },
            update: {
              status: "PAID",
              method: method ?? "razorpay",
              paidAt: new Date(),
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
          note: `Payment refunded: ${(refundAmount / 100).toFixed(2)} INR`,
        },
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}