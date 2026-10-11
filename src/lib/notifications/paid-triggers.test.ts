import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  classifyRazorpayWebhook,
  planWebhookAction,
  type WebhookOrderSnapshot,
} from "@/lib/payments/webhook-core";
import { derivePaymentStatus } from "@/lib/payments/payment-status";
import {
  paidConfirmationSkipReason,
  shouldNotifyAfterManualPayment,
} from "@/lib/notifications/paid-confirmation";

/**
 * The three entry points that may trigger a paid confirmation, and the single
 * condition they share: the order must have *fully* settled, and the notify must
 * happen only after the transaction that settled it has committed.
 *
 *   1. POST /api/payments/verify  — browser return (paidNow / PAID transition)
 *   2. POST /api/payments/webhook — Razorpay capture (capture.paymentStatus PAID)
 *   3. recordManualPayment        — admin-recorded payment (shared gate)
 *
 * The "fully paid only" rule is exercised through the same pure functions the
 * routes call, so a capture that covers only part of an order can never reach a
 * sender. The "after commit" rule is a structural property of the call sites and
 * is pinned against the real source, because the routes themselves cannot be run
 * here without a database.
 */

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

const REPO = path.resolve(import.meta.dirname, "..", "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(REPO, rel), "utf8");

function captureBody(args: {
  paymentId: string;
  amount: number;
  status?: string;
}): string {
  return JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: args.paymentId,
          order_id: "order_rzp_1",
          amount: args.amount,
          status: args.status ?? "captured",
          method: "upi",
          customer_id: "cust_1",
        },
      },
    },
  });
}

function snapshot(over: Partial<WebhookOrderSnapshot> = {}): WebhookOrderSnapshot {
  return {
    id: "order_1",
    total: 100000,
    paymentStatus: "PENDING",
    status: "PAYMENT_PENDING",
    razorpayCustomerId: null,
    hasPaidPayment: false,
    settledAmount: 0,
    ...over,
  };
}

void (async () => {
  // ── Webhook settlement: a capture notifies only when it fully settles ───────

  {
    const classification = classifyRazorpayWebhook(
      captureBody({ paymentId: "pay_1", amount: 100000 }),
    );
    assert.equal(classification.action, "CAPTURE");

    const plan = planWebhookAction({
      classification,
      order: snapshot(),
      existingPaymentStatus: null,
    });
    assert.equal(plan.kind, "CAPTURE");
    if (plan.kind === "CAPTURE") {
      assert.equal(
        plan.paymentStatus,
        "PAID",
        "a capture covering the full order derives PAID",
      );
      assert.equal(plan.orderStatus, "PAYMENT_RECEIVED");
    }
    pass("a capture that fully settles the order derives PAID");
  }

  {
    // Half the total: the balance stays payable, so the route's `=== "PAID"`
    // guard is false and no confirmation is sent.
    const classification = classifyRazorpayWebhook(
      captureBody({ paymentId: "pay_2", amount: 50000 }),
    );
    const plan = planWebhookAction({
      classification,
      order: snapshot(),
      existingPaymentStatus: null,
    });
    assert.equal(plan.kind, "CAPTURE");
    if (plan.kind === "CAPTURE") {
      assert.equal(plan.paymentStatus, "PARTIALLY_PAID");
    }
    pass("a partial capture derives PARTIALLY_PAID (never notifies)");
  }

  {
    // Already fully paid: the capture is an idempotent ACK, so no CAPTURE plan
    // exists and the route cannot reach the notify branch.
    const classification = classifyRazorpayWebhook(
      captureBody({ paymentId: "pay_3", amount: 100000 }),
    );
    const plan = planWebhookAction({
      classification,
      order: snapshot({ paymentStatus: "PAID" }),
      existingPaymentStatus: null,
    });
    assert.equal(plan.kind, "ACK");
    if (plan.kind === "ACK") assert.equal(plan.reason, "already-captured");
    pass("a capture for an already-paid order is ACKed, not re-sent");
  }

  {
    const classification = classifyRazorpayWebhook(
      captureBody({ paymentId: "pay_4", amount: 100000 }),
    );
    const plan = planWebhookAction({
      classification,
      order: null,
      existingPaymentStatus: null,
    });
    assert.equal(plan.kind, "ACK");
    pass("a capture with no order is ACKed, so it cannot notify");
  }

  // ── The derived status is the shared fully-paid predicate ──────────────────

  {
    assert.equal(derivePaymentStatus(100000, 100000, "PENDING"), "PAID");
    assert.equal(derivePaymentStatus(120000, 100000, "PENDING"), "PAID");
    assert.equal(derivePaymentStatus(99999, 100000, "PENDING"), "PARTIALLY_PAID");
    assert.equal(derivePaymentStatus(0, 100000, "PENDING"), "PENDING");
    assert.equal(
      derivePaymentStatus(100000, 100000, "REFUNDED"),
      "REFUNDED",
      "a refund is sticky and cannot be turned back into PAID",
    );
    pass("derivePaymentStatus reports PAID only when the full total is settled");
  }

  // ── Manual payments use the same fully-paid gate ───────────────────────────

  {
    assert.equal(
      shouldNotifyAfterManualPayment({ recordedAmount: 100000, paymentStatus: "PAID" }),
      true,
      "a manual payment that fully settles notifies",
    );
    for (const [recordedAmount, paymentStatus] of [
      [50000, "PARTIALLY_PAID"],
      [100000, "PENDING"],
      [0, "PAID"],
    ] as const) {
      assert.equal(
        shouldNotifyAfterManualPayment({ recordedAmount, paymentStatus }),
        false,
        `recordedAmount=${recordedAmount} paymentStatus=${paymentStatus} must not notify`,
      );
    }
    pass("manual payments notify only on a real, fully-settling payment");
  }

  {
    // The live send path shares this gate, so an order that is not fully paid is
    // skipped before any notification claim.
    for (const paymentStatus of ["PARTIALLY_PAID", "PENDING", "FAILED"]) {
      assert.equal(
        paidConfirmationSkipReason({
          paymentStatus,
          type: "PRODUCT",
          customerEmail: "a@b.c",
        }),
        "not-fully-paid",
      );
    }
    pass("the send gate itself refuses any order that is not fully paid");
  }

  // ── /verify: notify after commit, gated on the PAID transition ─────────────

  {
    const verify = read("src/app/api/payments/verify/route.ts");
    assert.ok(verify.includes("notifyPaidOrder(order.id)"), "verify must notify");
    assert.ok(
      verify.includes("if (settled.paymentStatus === \"PAID\") paidNow = true;"),
      "paidNow is set only by the settlement that lands the full payment",
    );
    assert.ok(verify.includes("if (paidNow)"), "the notify is guarded by paidNow");

    const tx = verify.indexOf("await prisma.$transaction(");
    const sync = verify.indexOf("await syncTrackingCache(order.id)");
    const notify = verify.indexOf("notifyPaidOrder(order.id)");
    assert.ok(tx >= 0 && sync > tx && notify > sync, "ordering must be locatable");
    assert.ok(
      notify > tx,
      "the verify notify must run after the settlement transaction",
    );
    assert.ok(
      notify > sync,
      "the verify notify must run after the post-commit cache refresh",
    );
    pass("verify notifies only for a PAID transition and only after commit");
  }

  // ── /webhook: notify after commit, gated on settledOrder + PAID ────────────

  {
    const webhook = read("src/app/api/payments/webhook/route.ts");
    assert.ok(webhook.includes("notifyPaidOrder(order!.id)"), "webhook must notify");
    assert.ok(
      webhook.includes(
        'if (capture.settledOrder && capture.paymentStatus === "PAID")',
      ),
      "the webhook notify is gated on a settled, fully-paid capture",
    );
    assert.ok(
      webhook.includes("await notifyPaidOrder(order!.id)"),
      "the webhook notify is awaited after the transaction",
    );

    const tx = webhook.indexOf("await prisma.$transaction(");
    const sync = webhook.indexOf("await refreshTrackingCache(order!.id)");
    const notify = webhook.indexOf("notifyPaidOrder(order!.id)");
    assert.ok(tx >= 0 && sync > tx && notify > sync, "ordering must be locatable");
    assert.ok(
      notify > tx,
      "the webhook notify must run after the capture transaction commits",
    );
    assert.ok(
      notify > sync,
      "the webhook notify must run after the post-commit cache refresh",
    );
    pass("webhook notifies only for a settled PAID capture and only after commit");
  }

  // ── recordManualPayment: notify after commit, gated on the shared gate ─────

  {
    const orders = read("src/app/admin/actions/orders.ts");
    assert.ok(
      orders.includes("shouldNotifyAfterManualPayment({ recordedAmount: payAmount, paymentStatus })"),
      "the manual payment notify must use the shared gate",
    );
    const start = orders.indexOf("export async function recordManualPayment");
    assert.ok(start >= 0, "recordManualPayment must be locatable");
    const next = orders.indexOf("export async function", start + 10);
    const body = orders.slice(start, next === -1 ? undefined : next);

    const tx = body.indexOf("await prisma.$transaction([");
    const sync = body.indexOf("await syncTrackingCache(orderId)");
    const gate = body.indexOf("shouldNotifyAfterManualPayment(");
    const notify = body.indexOf("notifyPaidOrder(orderId)");
    assert.ok(
      tx >= 0 && sync > tx && gate > sync && notify > gate,
      "ordering must be locatable",
    );
    assert.ok(
      notify > tx && notify > sync,
      "the manual-payment notify must run after the settlement tx commits",
    );
    assert.ok(
      body.includes('await import(\n      "@/lib/notifications/send-paid-confirmation"'),
      "the manual notify stays lazily imported so nothing else resolves the sender",
    );
    pass("manual payment notifies after commit and only through the shared gate");
  }

  console.log(`\nAll ${n} paid-trigger checks passed.`);
})();
