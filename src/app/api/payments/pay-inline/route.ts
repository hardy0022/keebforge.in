import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import Razorpay from "razorpay";

export const dynamic = "force-dynamic";

/**
 * Opens a NEW Razorpay session for an EXISTING order that's still unpaid
 * (e.g. the customer pays from /track-order). Public by design — the order
 * number is the sole key, and /verify guards the actual capture with the
 * HMAC + stored razorpayOrderId binding.
 *
 * The order's billingDetails.razorpayOrderId is refreshed so a re-pay and a
 * first attempt land on the same id as the verify check.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const orderNumber =
      typeof body?.orderNumber === "string"
        ? body.orderNumber.replace(/[\s-]+/g, "").toUpperCase()
        : "";
    if (!/^[A-Z0-9]{4,20}$/.test(orderNumber)) {
      return NextResponse.json({ error: "That doesn't look like a valid order number." }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        paymentStatus: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        billingDetails: true,
        payments: { select: { amount: true, status: true } },
      },
    });
    if (!order) {
      return NextResponse.json({ error: "No order was found for that number." }, { status: 404 });
    }
    if (order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED") {
      return NextResponse.json({ error: "This order is already paid." }, { status: 400 });
    }

    const paid = order.payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);
    const outstanding = order.total - paid;
    if (outstanding <= 0) {
      return NextResponse.json(
        { error: "There's nothing to pay for this order yet — final pricing may still be pending." },
        { status: 400 }
      );
    }

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!order.customerEmail || !keyId || !keySecret) {
      return NextResponse.json({ error: "Online payments are temporarily unavailable. Please contact support." }, { status: 503 });
    }

    const rzpOrder = await new Razorpay({ key_id: keyId, key_secret: keySecret }).orders.create({
      amount: outstanding,
      currency: "INR",
      receipt: order.orderNumber,
      notes: { orderId: order.id, orderNumber: order.orderNumber, source: "track-order" },
    });

    const billing = (order.billingDetails ?? {}) as Record<string, unknown>;
    await prisma.order.update({
      where: { id: order.id },
      data: { billingDetails: { ...billing, razorpayOrderId: rzpOrder.id } as Prisma.InputJsonValue },
    });

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
    });
  } catch (e) {
    console.error("[pay-inline] failed:", e);
    return NextResponse.json({ error: "Failed to start payment. Please try again." }, { status: 500 });
  }
}