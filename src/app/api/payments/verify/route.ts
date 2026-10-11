import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentAuth } from "@/lib/auth/session";
import { syncTrackingCache } from "@/lib/orders/tracking";
import {
  capturedAmount,
  settledAmount,
} from "@/lib/payments/payment-status";
import { settleOrderInTransaction } from "@/lib/payments/settle-order";
import { notifyPaidOrder } from "@/lib/notifications/send-paid-confirmation";
import { verifyRazorpayCheckoutSignature } from "@/lib/payments/razorpay-signature";
import {
  checkRateLimit,
  clientIp,
  rateLimitResponse,
} from "@/lib/payments/rate-limit";
import { readJsonBody } from "@/lib/http/read-json-body";
import { JSON_BODY_LIMIT_SMALL } from "@/lib/utils/limits";

export const dynamic = "force-dynamic";

/**
 * Razorpay handshake verification.
 *
 * Guests may pay, so this endpoint does NOT require a session. Integrity comes
 * from the HMAC signature (order|payment signed with the key secret) plus the
 * stored razorpayOrderId binding on the order — not from authentication.
 *
 * Both limits are keyed per client and set far above what a human retrying a
 * card needs. The per-order one exists because the attack this endpoint must
 * survive is "one order, endless fake payment ids", which an IP-only limit does
 * not catch behind rotating proxies.
 */
const RATE_LIMIT_IP = { limit: 30, windowMs: 60_000 };
const RATE_LIMIT_ORDER = { limit: 10, windowMs: 60_000 };

/** Razorpay ids/signatures are short; bound them before they become DB keys. */
const bodySchema = z.object({
  razorpay_order_id: z.string().min(1).max(64),
  razorpay_payment_id: z.string().min(1).max(64),
  razorpay_signature: z.string().min(1).max(256),
  orderId: z.string().min(1).max(64),
});

export async function POST(req: NextRequest) {
  try {
    // Before anything else, and keyed only on the caller, so a flood of
    // malformed bodies cannot reach the database.
    const ipLimit = checkRateLimit(
      `verify:ip:${clientIp(req)}`,
      RATE_LIMIT_IP,
    );
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit, "verify");

    const bodyRead = await readJsonBody(req, JSON_BODY_LIMIT_SMALL);
    if (!bodyRead.ok) {
      return NextResponse.json(
        { error: "Missing payment verification data" },
        { status: bodyRead.status },
      );
    }
    const body = (bodyRead.data ?? {}) as Record<string, unknown>;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
    } = body as {
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
      orderId?: string;
    };

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !orderId
    ) {
      return NextResponse.json(
        { error: "Missing payment verification data" },
        { status: 400 },
      );
    }

    if (!bodySchema.safeParse(body).success) {
      return NextResponse.json(
        { error: "Invalid payment verification data" },
        { status: 400 },
      );
    }

    const orderLimit = checkRateLimit(
      `verify:order:${orderId}`,
      RATE_LIMIT_ORDER,
    );
    if (!orderLimit.allowed) return rateLimitResponse(orderLimit, "verify");

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      return NextResponse.json(
        { error: "Payments are not configured" },
        { status: 503 },
      );
    }

    // findFirst, not findUnique: a soft-deleted order is not gone, and letting a
    // deleted order be marked paid would resurrect it into the admin queues and
    // write a customer-visible timeline entry on a cancelled order.
    const order = await prisma.order.findFirst({
      where: { id: orderId, isDeleted: false },
      include: { payments: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Idempotency: replayed verifications are a no-op success.
    if (
      (order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED") &&
      order.payments.some((p) => p.razorpayPaymentId === razorpay_payment_id)
    ) {
      return NextResponse.json({ success: true, alreadyProcessed: true });
    }

    // The payment must belong to the Razorpay order we created for THIS order.
    const billing = (order.billingDetails ?? {}) as {
      razorpayOrderId?: string;
      razorpayCustomerId?: string;
      razorpayOrderAmount?: number;
    };
    if (
      !billing.razorpayOrderId ||
      billing.razorpayOrderId !== razorpay_order_id
    ) {
      return NextResponse.json(
        { error: "Payment does not match this order" },
        { status: 400 },
      );
    }

    // What this payment is worth. NEVER the order total: pay-inline opens one
    // Razorpay order per attempt for the *outstanding balance*, so the second
    // capture on a partially-paid order legitimately covers less than the total.
    // Recording the total for it made the paid sum overshoot, which reported the
    // order as fully paid while the customer still owed the remainder.
    //
    // Razorpay's checkout handler sends no amount, so the trustworthy figure here
    // is the amount the Razorpay order was created for. Already-recorded payments
    // keep the amount they were first written with, which makes a replayed
    // verify idempotent instead of counting the same payment twice.
    const existingPayment = order.payments.find(
      (p) => p.razorpayPaymentId === razorpay_payment_id,
    );
    const settledBefore = settledAmount(
      order.payments.filter((p) => p.razorpayPaymentId !== razorpay_payment_id),
    );
    const amount =
      existingPayment?.amount ??
      capturedAmount({
        total: order.total,
        settled: settledBefore,
        razorpayOrderAmount: billing.razorpayOrderAmount ?? null,
      });

    // Constant-time, and shared with the webhook route.
    if (
      !verifyRazorpayCheckoutSignature({
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        signature: razorpay_signature,
        keySecret,
      })
    ) {
      // Nothing is written. A failed HMAC means we cannot establish that
      // Razorpay created any payment at all, yet this endpoint used to upsert a
      // FAILED `Payment` row AND an `OrderTimeline` entry for it — both keyed on
      // an attacker-supplied `razorpay_payment_id`. Varying that id produced
      // unbounded fake payments (inflating the admin FAILED tile) and unbounded
      // customer-visible timeline entries, on any order whose id one could guess
      // or enumerate. Rejecting without writing makes the endpoint unable to be
      // used as a write amplifier at all, independent of the rate limit above.
      console.error(
        `Payment signature verification failed for order ${order.orderNumber} (payment ${razorpay_payment_id})`,
      );
      return NextResponse.json(
        { error: "Invalid payment signature" },
        { status: 400 },
      );
    }

    // Claim-by-email: associate a guest order with the account when the emails match.
    let profileId = order.profileId;
    if (!profileId) {
      const { profile } = await getCurrentAuth();
      const linked =
        (profile && profile.id) ||
        (
          await prisma.profile.findUnique({
            where: { email: order.customerEmail },
          })
        )?.id ||
        null;
      profileId = linked;
    }

    // The PAID transition mirrors the webhook's idempotency: the order-level
    // guard makes it run at most once even if a webhook and this verify race on
    // the same razorpayPaymentId (a concurrent PAID write makes us skip, never
    // throw on a duplicate payment row). REFUNDED is guarded for the same
    // reason — a replayed verify must not un-refund a settled refund.
    //
    // Set true only when THIS transaction lands the full-payment transition, so
    // the confirmation is triggered after commit and never on a partial capture.
    let paidNow = false;

    await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { id: order.id },
        select: { paymentStatus: true },
      });
      if (
        current?.paymentStatus === "PAID" ||
        current?.paymentStatus === "REFUNDED"
      ) {
        return;
      }

      // F9. Re-read the payment inside the transaction and never write status over a
      // settled refund.
      //
      // Both REFUNDED guards above test the ORDER's status, which is not the same
      // question. An order can be PARTIALLY_PAID while one of its individual
      // payments is fully REFUNDED — a second capture was taken, then the first
      // was returned, leaving money still retained. A replayed verification for
      // that returned payment slipped past both guards (the order was not
      // REFUNDED) and reached the upsert, whose `update` branch hardcoded
      // `status: "PAID"` — flipping a payment whose money had gone back to PAID.
      //
      // `refundedAmount` was absent from that branch, so gross and net were
      // unaffected and no balance moved; the defect was that the ledger stopped
      // describing what happened, and a payment labelled PAID is one a later
      // refund would match against as though it had never been returned.
      //
      // The upsert therefore becomes an explicit read-then-branch: an existing
      // REFUNDED payment is left exactly as it is, and the order is not re-settled
      // on the strength of a payment that returned its money.
      const alreadyRecorded = await tx.payment.findUnique({
        where: { razorpayPaymentId: razorpay_payment_id },
        select: { status: true, amount: true },
      });
      const paymentReturned =
        alreadyRecorded?.status === "REFUNDED" ||
        order.payments.some(
          (p) =>
            p.razorpayPaymentId === razorpay_payment_id && p.status === "REFUNDED",
        );

      if (paymentReturned) {
        // Record nothing and re-settle nothing. The money for this payment was
        // returned; a replayed checkout callback must not resurrect it.
        return;
      }

      // The read above is a hint, not a lock. A refund can settle between it and
      // this write, and the old `upsert` flipped `status: "PAID"` unconditionally
      // — so under READ COMMITTED a refund landing in that window was overwritten
      // and the payment went back on the books as money the customer still holds.
      //
      // So the write refuses, rather than trusting the read. Both statements below
      // rely on the same Postgres guarantee the refund path uses: `createMany` is
      // ON CONFLICT DO NOTHING, and a status predicate on `updateMany` is
      // re-evaluated against the committed row while the row lock is held.
      if (!alreadyRecorded) {
        await tx.payment.createMany({
          data: [
            {
              orderId: order.id,
              amount,
              currency: "INR",
              status: "PAID",
              method: "razorpay",
              razorpayOrderId: razorpay_order_id,
              razorpayPaymentId: razorpay_payment_id,
              razorpaySignature: razorpay_signature,
              ...(billing.razorpayCustomerId
                ? { razorpayCustomerId: billing.razorpayCustomerId }
                : {}),
              paidAt: new Date(),
            },
          ],
          skipDuplicates: true,
        });
      }

      const claimed = await tx.payment.updateMany({
        where: {
          razorpayPaymentId: razorpay_payment_id,
          // The whole point: a REFUNDED payment is terminal and cannot be moved
          // back to PAID by a replayed checkout callback.
          status: { not: "REFUNDED" },
        },
        data: {
          status: "PAID",
          paidAt: new Date(),
          ...(billing.razorpayCustomerId
            ? { razorpayCustomerId: billing.razorpayCustomerId }
            : {}),
        },
      });

      if (claimed.count === 0) {
        // A refund settled while this transaction was writing. Leave the payment
        // and the order exactly as the refund left them: re-settling here is what
        // would let money the customer already returned be collected twice.
        return;
      }

      // Settle the order from rows read INSIDE this transaction.
      //
      // `settledBefore` above was computed from the read at the top of the route,
      // before this transaction opened, and writing `settledBefore + amount` back as
      // an absolute `Order.paymentStatus` made this a lost update: two captures for
      // two different payments both read the same payment list, both derived
      // PARTIALLY_PAID, and the last write won — so a fully paid order could sit at
      // PARTIALLY_PAID with an order status that never reaches PAYMENT_RECEIVED.
      // That is the same arithmetic the webhook just had fixed, so both routes call
      // the one helper that recomputes under a compare-and-swap.
      //
      // Bounded retry is safe here because the attempt is idempotent: it writes
      // absolute values derived from rows read in that same attempt, and the payment
      // row was already claimed above.
      const settled = await settleOrderInTransaction(tx, {
        orderId: order.id,
        amount,
        razorpayPaymentId: razorpay_payment_id,
      });

      if (settled.kind === "LOST") {
        console.error(
          `Payment ${razorpay_payment_id} was recorded but order ${order.id} could not be ` +
            `settled after ${settled.attempts} attempts; it stays unsettled for reconciliation.`,
        );
        return;
      }

      // This settlement is the one that made the order fully paid.
      if (settled.paymentStatus === "PAID") paidNow = true;

      // Claim-by-email above still has to land. `profileId` is a foreign key and so
      // is absent from Prisma's `updateMany` input, which means it cannot ride the
      // conditional write — it stays its own statement, exactly as it was before
      // this route gained the CAS. It is identity, not money state, so it carries no
      // concurrency hazard of its own.
      if (profileId) {
        await tx.order.update({
          where: { id: order.id },
          data: { profileId },
        });
      }

      await tx.orderTimeline.create({
        data: {
          orderId: order.id,
          status: "PAYMENT_RECEIVED",
          note: `Payment captured via Razorpay (${razorpay_payment_id}).`,
        },
      });
    });

    await syncTrackingCache(order.id);

    if (paidNow) {
      // After the transaction commits, on purpose: a confirmation failure must
      // never be able to roll back a captured payment. Best-effort inside.
      await notifyPaidOrder(order.id);
    }

    return NextResponse.json({ success: true, orderNumber: order.orderNumber });
  } catch (error) {
    console.error("Verify payment error:", error);
    return NextResponse.json(
      { error: "Payment verification failed" },
      { status: 500 },
    );
  }
}
