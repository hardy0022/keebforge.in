import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { settledAmount } from "@/lib/payments/payment-status";
import { settleOrderInTransaction } from "@/lib/payments/settle-order";
import {
  applyRefundToPayments,
  planRefundAccounting,
  shouldCloseOrderAfterRefund,
} from "@/lib/payments/refund-accounting";
import { syncTrackingCache } from "@/lib/orders/tracking";
import {
  classifyRazorpayWebhook,
  planWebhookAction,
  readWebhookSecret,
  verifyWebhookSignature,
  webhookTimelineNote,
  type WebhookOrderSnapshot,
} from "@/lib/payments/webhook-core";
import { formatINR } from "@/lib/utils/money";

export const dynamic = "force-dynamic";

/**
 * Rebuild the customer-facing /track cache after the payment rows have landed.
 *
 * Runs strictly after the transaction commits: inside it, the rebuild would read
 * pre-commit state and cache the old payment status. Best-effort by design — the
 * money is already recorded, so a cache failure must not turn into a non-2xx,
 * because a 500 makes Razorpay redeliver an event that already applied.
 */
async function refreshTrackingCache(orderId: string): Promise<void> {
  try {
    await syncTrackingCache(orderId);
  } catch (error) {
    console.error(`Tracking cache rebuild failed for order ${orderId}:`, error);
  }
}

/**
 * Razorpay payment + refund webhook.
 *
 * Security: every request is authenticated with an HMAC-SHA256 signature over
 * the RAW request body using RAZORPAY_WEBHOOK_SECRET. The body is consumed as
 * text and hashed BEFORE any JSON parsing — re-serializing the payload would
 * break the signature.
 *
 * Idempotency: Razorpay retries any event that does not return 2xx, and can
 * deliver the same event twice. We therefore always answer 200 with
 * `{received:true}` even when we choose to ignore the event, and every
 * transition is guarded in planWebhookAction so a redelivered or out-of-order
 * event can never corrupt an order that already holds money.
 *
 * All routing and idempotency decisions live in @/lib/payments/webhook-core,
 * which is unit-tested against real Razorpay payload shapes.
 */
export async function POST(req: NextRequest) {
  try {
    const webhookSecret = readWebhookSecret(
      process.env.RAZORPAY_WEBHOOK_SECRET,
    );
    if (!webhookSecret) {
      console.error(
        "RAZORPAY_WEBHOOK_SECRET is not set. Every webhook is rejected until it is " +
          "configured: Razorpay Dashboard -> Settings -> Webhooks -> your endpoint -> " +
          "Secret. Do NOT substitute RAZORPAY_KEY_SECRET; the digest will never match.",
      );
      return NextResponse.json(
        { error: "Webhook processing failed" },
        { status: 500 },
      );
    }

    const rawBody = await req.text();

    if (!verifyWebhookSignature(rawBody, req.headers.get("x-razorpay-signature"), webhookSecret)) {
      console.error("Invalid webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const classification = classifyRazorpayWebhook(rawBody);
    if (classification.action === "ACK") return NextResponse.json({ received: true });

    const razorpayOrderId = classification.razorpayOrderId;
    if (!razorpayOrderId || !classification.paymentId) {
      return NextResponse.json({ received: true });
    }
    const paymentId = classification.paymentId;
    const [existingPayment, order] = await Promise.all([
      prisma.payment.findUnique({
        where: { razorpayPaymentId: paymentId },
        select: { id: true, status: true, amount: true, refundedAmount: true },
      }),
      prisma.order.findFirst({
        where: {
          // A soft-deleted order must not be settled by a late webhook: it would
          // resurrect the order's payment state, rewrite its customer-facing
          // tracking cache and re-queue it for fulfilment.
          isDeleted: false,
          billingDetails: { path: ["razorpayOrderId"], equals: razorpayOrderId },
        },
        include: {
          payments: {
            select: {
              status: true,
              amount: true,
              refundedAmount: true,
              razorpayPaymentId: true,
            },
          },
        },
      }),
      // The Refund row is NOT read here. It is the refund idempotency key, and
      // Batch 5A moved that read inside the transaction that acts on it — reading
      // it out here is what made the old write a lost update under concurrency.
    ]);

    // Ack even when the order isn't found yet: a webhook can race with order
    // creation. Returning non-2xx makes Razorpay retry, eventually timing out.
    if (!order) {
      console.warn(`Order not found for Razorpay order_id: ${razorpayOrderId}`);
    }

    const billing = (order?.billingDetails ?? {}) as {
      razorpayCustomerId?: string;
    };
    const snapshot: WebhookOrderSnapshot | null = order
      ? {
          id: order.id,
          total: order.total,
          paymentStatus: order.paymentStatus,
          status: order.status,
          razorpayCustomerId: billing.razorpayCustomerId ?? null,
          hasPaidPayment: order.payments.some((p) => p.status === "PAID"),
          // GROSS, deliberately. This decides whether the order was ever paid,
          // which is not the same question as how much is still retained — see
          // netCollectedAmount, which is what balances are computed from.
          settledAmount: settledAmount(order.payments),
        }
      : null;

    const plan = planWebhookAction({
      classification,
      order: snapshot,
      existingPaymentStatus: existingPayment?.status ?? null,
    });

    if (plan.kind === "ACK") {
      console.log(
        `[razorpay-webhook] ${classification.event} ignored (${plan.reason}) payment=${paymentId}`,
      );
      return NextResponse.json({ received: true });
    }

    const planNote = webhookTimelineNote(plan);
    const customerId = plan.customerId;

    if (plan.kind === "CAPTURE") {
      const capture = await prisma.$transaction(async (tx) => {
        // ── Write the capture, refusing to move returned money ────────────────
        //
        // `createMany … skipDuplicates` is ON CONFLICT DO NOTHING: its count is
        // "did I insert", and unlike a unique violation it does not abort the
        // transaction, so a redelivery that loses the insert race can carry on.
        //
        // The `updateMany` is the claim, and the predicate is the whole point. A
        // REFUNDED payment is terminal — its money went back to the customer — so
        // Postgres taking the row lock and THEN re-evaluating `status != REFUNDED`
        // against the committed version is what makes the refusal hold under
        // concurrency. A read-then-branch could not: a refund settling between the
        // read and this write was silently overwritten, which is precisely the race
        // /api/payments/verify documents at its F9 comment.
        //
        // `refundedAmount` is absent from `data` deliberately. Nothing in capture
        // processing may reset or reduce it — the returned figure is a fact about
        // the payment, and the refund path owns it exclusively.
        await tx.payment.createMany({
          data: [
            {
              orderId: order!.id,
              amount: plan.amount,
              currency: "INR",
              status: "PAID",
              method: plan.method,
              razorpayOrderId: plan.razorpayOrderId,
              razorpayPaymentId: plan.paymentId,
              razorpaySignature: "",
              ...(customerId ? { razorpayCustomerId: customerId } : {}),
              paidAt: new Date(),
            },
          ],
          skipDuplicates: true,
        });

        const claimed = await tx.payment.updateMany({
          where: {
            razorpayPaymentId: plan.paymentId,
            status: { not: "REFUNDED" },
          },
          data: {
            status: "PAID",
            method: plan.method,
            paidAt: new Date(),
            ...(customerId ? { razorpayCustomerId: customerId } : {}),
          },
        });

        // Zero rows means a refund settled this payment while this transaction was
        // deciding. Leave the payment AND the order exactly as the refund left
        // them: re-settling here is what would let money the customer already
        // returned be collected a second time.
        if (claimed.count === 0) {
          return { kind: "ACK" as const, reason: "already-refunded" as const };
        }

        // ── Settle the order from rows read inside this transaction ───────────
        //
        // `plan.paymentStatus` and `plan.orderStatus` were derived from a
        // `settledAmount()` read taken BEFORE this transaction opened. Two captures
        // for two different payments on one order both read the same list, both
        // derive PARTIALLY_PAID, and the last absolute write wins — leaving a fully
        // paid order marked PARTIALLY_PAID and, because neither plan saw `fullyPaid`,
        // an order status that never reaches PAYMENT_RECEIVED. The helper
        // recomputes from current rows and writes under a compare-and-swap, so a
        // lost attempt is retried against the winner's committed state.
        const settled = await settleOrderInTransaction(tx, {
          orderId: order!.id,
          amount: plan.amount,
          razorpayPaymentId: plan.paymentId,
        });

        if (settled.kind === "LOST") {
          // The Payment row is already written and this transaction is about to
          // COMMIT, so the money IS recorded — reporting this as an ignored event
          // would be a lie, and skipping the tracking refresh would leave the
          // customer-facing cache describing pre-capture state. The order is left
          // unsettled for reconciliation, loudly.
          console.warn(
            `Capture ${plan.paymentId} recorded but order ${order!.id} could not be settled ` +
              `after ${settled.attempts} attempts; it stays unsettled for reconciliation.`,
          );
          return { kind: "APPLIED" as const, settledOrder: false, attempts: settled.attempts };
        }

        await tx.orderTimeline.create({
          data: { orderId: order!.id, status: "PAYMENT_RECEIVED", note: planNote },
        });

        return {
          kind: "APPLIED" as const,
          settledOrder: true,
          paymentStatus: settled.paymentStatus,
          orderStatus: settled.orderStatus,
          attempts: settled.attempts,
        };
      });

      if (capture.kind === "ACK") {
        // Always 200, like every other ignore path: a non-2xx makes Razorpay
        // redeliver an event that must never apply.
        console.log(
          `[razorpay-webhook] ${classification.event} ignored (${capture.reason}) payment=${plan.paymentId}`,
        );
        return NextResponse.json({ received: true });
      }

      if (capture.attempts > 1 && capture.settledOrder) {
        console.warn(
          `[razorpay-webhook] capture ${plan.paymentId} lost the order settlement race and ` +
            `settled on attempt ${capture.attempts}`,
        );
      }
      await refreshTrackingCache(order!.id);
      return NextResponse.json({ received: true });
    }

    if (plan.kind === "FAIL") {
      await prisma.$transaction(async (tx) => {
        await tx.payment.upsert({
          where: { razorpayPaymentId: plan.paymentId },
          update: {
            status: "FAILED",
            failureReason: plan.failureReason,
            ...(customerId ? { razorpayCustomerId: customerId } : {}),
          },
          create: {
            orderId: order!.id,
            amount: plan.amount,
            currency: "INR",
            status: "FAILED",
            method: "razorpay",
            razorpayOrderId: plan.razorpayOrderId,
            razorpayPaymentId: plan.paymentId,
            razorpaySignature: "",
            ...(customerId ? { razorpayCustomerId: customerId } : {}),
            failureReason: plan.failureReason,
          },
        });

        // Guarded: a late failure for one attempt must not erase a successful
        // payment (or a partial one) already recorded on this order.
        if (plan.degradeOrder) {
          await tx.order.update({
            where: { id: order!.id },
            data: { paymentStatus: "FAILED" },
          });
        }

        await tx.orderTimeline.create({
          data: { orderId: order!.id, status: "ORDER_RECEIVED", note: planNote },
        });
      });
      await refreshTrackingCache(order!.id);
      return NextResponse.json({ received: true });
    }

    // ── Refunds ────────────────────────────────────────────────────────────
    //
    // Every read that feeds the money arithmetic happens INSIDE the transaction
    // below. The reads above are still needed to locate the order and to plan the
    // event, but they are deliberately not used for the refund decision.
    //
    // They used to be, and that was a lost-update bug. `existingPayment` and
    // `existingRefund` were read before the transaction opened, and the write
    // inside it was an ABSOLUTE `refundedAmount: refundTotalAfter`. Two refunds
    // settling concurrently both read the same starting value, both computed the
    // same absolute total, and the second write silently discarded the first —
    // leaving the order recorded as holding money Razorpay had already returned,
    // and so still owing a balance that no longer existed. With no isolationLevel
    // set the transaction is READ COMMITTED, so nothing serialised them.
    //
    // Now: re-read inside the transaction for the decision, and apply the change
    // as an ATOMIC INCREMENT guarded by the capture ceiling. `updateMany` with a
    // `refundedAmount <= …` predicate emits `UPDATE … WHERE id = ? AND
    // refundedAmount <= ?`, and Postgres re-evaluates that predicate against the
    // committed row once it holds the row lock — so concurrent increments both
    // land, and neither can overshoot the capture.
    const outcome = await prisma.$transaction(async (tx) => {
      const [lockedPayment, lockedRefund, lockedOrder] = await Promise.all([
        tx.payment.findUnique({
          where: { razorpayPaymentId: paymentId },
          select: { id: true, status: true, amount: true, refundedAmount: true },
        }),
        plan.refundId
          ? tx.refund.findUnique({
              where: { razorpayRefundId: plan.refundId },
              select: { status: true, amount: true },
            })
          : Promise.resolve(null),
        tx.order.findFirst({
          where: { id: order!.id },
          select: {
            id: true,
            total: true,
            paymentStatus: true,
            payments: {
              select: {
                status: true,
                amount: true,
                refundedAmount: true,
                razorpayPaymentId: true,
              },
            },
          },
        }),
      ]);

      // All figures come from planRefundAccounting, which owns gross-vs-net and
      // the partial/full distinction. This block only executes the plan.
      const accounting = planRefundAccounting({
        refundId: plan.refundId,
        refundAmount: plan.refundAmount,
        phase: plan.phase,
        payment: lockedPayment
          ? { ...lockedPayment, id: lockedPayment.id }
          : null,
        existing: lockedRefund
          ? { status: lockedRefund.status, amount: lockedRefund.amount }
          : null,
      });

      if (accounting.kind === "REFUND_ACK") {
        return { kind: "ACK" as const, reason: accounting.reason };
      }

      // ── Claim the refund, exactly once ─────────────────────────────────────
      //
      // The read above is only a hint. Two deliveries of the SAME refund can both
      // reach this point having seen no ledger row, which is why the money move
      // below is an increment: the old absolute write was idempotent for
      // concurrent duplicates by accident, and that accident was load-bearing.
      // Incrementing without a claim turns that accident into a double refund —
      // two deliveries both add 30 000 to the same payment.
      //
      // So the claim is the part that is atomic, and it is made of two statements:
      //
      // 1. `createMany … skipDuplicates` is ON CONFLICT DO NOTHING. Its `count` is
      //    exactly "did I create this ledger row", and unlike a unique violation
      //    it does not abort the transaction, so the loser can carry on and
      //    acknowledge instead of dying with a 500 that triggers a redelivery.
      //
      // 2. `updateMany` with a status predicate is the claim itself. Postgres
      //    re-evaluates a row's WHERE after a concurrent writer releases the lock
      //    on it, so `status NOT IN ('PROCESSED', <incoming phase>)` lets exactly
      //    one delivery move a given refund off a given phase. Everyone else
      //    matches zero rows, which is the ACK.
      const claimedAt = accounting.phase === "PROCESSED" ? new Date() : null;

      const inserted = await tx.refund.createMany({
        data: [
          {
            orderId: order!.id,
            paymentId: accounting.paymentId,
            razorpayRefundId: accounting.refundId,
            amount: accounting.amount,
            razorpayPaymentId: plan.paymentId ?? null,
            // A ledger row always opens at CREATED and is advanced by the claim.
            // Writing the incoming phase here would make a duplicate delivery
            // indistinguishable from the real one before the claim ever runs.
            status: "CREATED",
          },
        ],
        skipDuplicates: true,
      });

      // Backfill linkage only. The refund's own amount never changes between
      // events — only its phase does — so a later payload's figure must never
      // rewrite what was recorded first.
      await tx.refund.update({
        where: { razorpayRefundId: accounting.refundId },
        data: {
          orderId: order!.id,
          paymentId: accounting.paymentId,
          ...(plan.paymentId !== undefined && plan.paymentId !== null
            ? { razorpayPaymentId: plan.paymentId }
            : {}),
        },
      });

      const claim =
        accounting.phase === "CREATED"
          ? null
          : await tx.refund.updateMany({
              where: {
                razorpayRefundId: accounting.refundId,
                status: { notIn: ["PROCESSED", accounting.phase] },
              },
              data: {
                status: accounting.phase,
                ...(claimedAt ? { processedAt: claimedAt } : {}),
              },
            });

      if (claim?.count === 0) {
        // Someone else advanced or settled this refund while we were deciding.
        // Re-read so the acknowledgement names the right reason.
        const settled = await tx.refund.findUnique({
          where: { razorpayRefundId: accounting.refundId },
          select: { status: true },
        });
        return {
          kind: "ACK" as const,
          reason:
            settled?.status === "PROCESSED"
              ? ("already-settled" as const)
              : ("already-recorded" as const),
        };
      }

      // `refund.created` has no phase to transition through — creating the row IS
      // the record, and `inserted.count` is the atomic test for "am I the one who
      // created it". A redelivery that lost the insert race must not append a
      // second "Refund initiated" line to the customer-visible timeline.
      //
      // The sequential redelivery of a CREATED is already acknowledged above by
      // planRefundAccounting's stored-phase guard; this covers the overlap.
      if (accounting.phase === "CREATED" && inserted.count === 0) {
        return { kind: "ACK" as const, reason: "already-recorded" as const };
      }

      // Paise to add to this payment. `refundDelta` is 0 for a redelivery, for
      // refund.created (not settled yet) and for refund.failed (never happened),
      // so only a genuinely new settlement moves money.
      let refundedTotalAfter = accounting.refundTotalAfter;
      let fullyRefunded = accounting.fullyRefunded;

      // A refund can arrive for a capture this app never recorded (capture event
      // lost, or the webhook secret was unconfigured at the time). There is then
      // no Payment row to increment, and the refund is still recorded against the
      // order — it really happened and the money really went back.
      if (!lockedPayment) {
        if (accounting.phase === "PROCESSED") {
          console.warn(
            `Refund ${accounting.refundId} for unrecorded payment ${plan.paymentId}; order still reconciled`,
          );
        }
      } else if (accounting.refundDelta > 0) {
        const ceiling = Math.max(0, Math.trunc(lockedPayment.amount));

        // Guarded atomic increment. The predicate re-checks the ceiling against
        // the committed row while holding the row lock, so concurrent refunds add
        // up instead of overwriting one another, and neither exceeds the capture.
        const bumped = await tx.payment.updateMany({
          where: {
            id: lockedPayment.id,
            refundedAmount: { lte: ceiling - accounting.refundDelta },
          },
          data: { refundedAmount: { increment: accounting.refundDelta } },
        });

        if (bumped.count === 0) {
          // Another refund consumed the remaining headroom between our read and
          // our write. Add only the room genuinely left — and re-check that room
          // under the row lock in a second guarded write, because the gap between
          // reading it and claiming it is another refund's window to take it. An
          // unguarded increment here would overshoot the capture, and
          // refundedAmount must never exceed what was ever captured.
          const current = await tx.payment.findUnique({
            where: { id: lockedPayment.id },
            select: { refundedAmount: true },
          });
          const spent = Math.trunc(current?.refundedAmount ?? 0);
          const room = Math.max(0, ceiling - spent);
          if (room > 0) {
            await tx.payment.updateMany({
              where: {
                id: lockedPayment.id,
                refundedAmount: { lte: ceiling - room },
              },
              data: { refundedAmount: { increment: room } },
            });
          }
          // The committed total is read back below, so there is nothing to
          // predict here — a figure computed from a stale read is exactly the
          // kind that made the original lost-update bug possible.
        }

        // Read back so the status decision and the log use the committed total,
        // not the figure this transaction hoped to write.
        const settled = await tx.payment.findUnique({
          where: { id: lockedPayment.id },
          select: { refundedAmount: true },
        });
        refundedTotalAfter = Math.min(
          ceiling,
          Math.trunc(settled?.refundedAmount ?? 0),
        );
        fullyRefunded = ceiling > 0 && refundedTotalAfter >= ceiling;

        // A PARTIAL refund deliberately leaves the payment PAID. The enum has no
        // PARTIALLY_REFUNDED state, and downgrading it to REFUNDED would drop it
        // out of pay-inline's paid-sum, re-inflating the outstanding balance to
        // the full order total and inviting a second collection.
        if (fullyRefunded) {
          await tx.payment.updateMany({
            where: { id: lockedPayment.id },
            data: { status: "REFUNDED" },
          });
        }
      }

      // Whether this refund closes the ORDER. Recomputed from the order's own
      // payment rows, never inferred from this single event — and gated on the
      // order having actually held its full worth, so a partially captured order
      // whose capture came back in full keeps a payable balance instead of being
      // closed as REFUNDED and becoming permanently uncollectable.
      let closedOrder = false;
      if (accounting.phase === "PROCESSED" && lockedOrder && plan.paymentId) {
        const after = applyRefundToPayments(lockedOrder.payments, {
          razorpayPaymentId: plan.paymentId,
          status: fullyRefunded ? "REFUNDED" : "PAID",
          refundedAmount: refundedTotalAfter,
        });
        if (
          shouldCloseOrderAfterRefund({
            total: lockedOrder.total,
            payments: after,
          }) &&
          lockedOrder.paymentStatus !== "REFUNDED"
        ) {
          await tx.order.update({
            where: { id: lockedOrder.id },
            data: { paymentStatus: "REFUNDED" },
          });
          closedOrder = true;
        }
      }

      await tx.orderTimeline.create({
        data: { orderId: order!.id, status: "ORDER_RECEIVED", note: accounting.note },
      });

      return {
        kind: "APPLIED" as const,
        refundId: accounting.refundId,
        phase: accounting.phase,
        amount: accounting.amount,
        refundedTotalAfter,
        closedOrder,
      };
    });

    if (outcome.kind === "ACK") {
      // Always 200. `already-settled` is the common case — Razorpay re-delivers
      // refund events — and a non-2xx would loop forever on an event that is
      // already correctly applied. Re-deciding inside the transaction is what
      // makes that safe: a redelivery arriving after the first copy committed now
      // sees the stored row and acknowledges, rather than writing a second time.
      console.log(
        `[razorpay-webhook] ${classification.event} ignored (${outcome.reason}) refund=${plan.refundId ?? "?"}`,
      );
      return NextResponse.json({ received: true });
    }

    await refreshTrackingCache(order!.id);

    // Logged so a divergence between this app's net figure and Razorpay's
    // dashboard is visible in the deploy logs without a query.
    console.log(
      `[razorpay-webhook] ${outcome.phase.toLowerCase()} refund ${outcome.refundId} of ${formatINR(
        outcome.amount,
      )} on order ${order!.id}; refunded on payment now ${formatINR(
        outcome.refundedTotalAfter,
      )}${outcome.closedOrder ? "; order closed as REFUNDED" : ""}`,
    );

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}