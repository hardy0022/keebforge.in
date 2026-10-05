import assert from "node:assert/strict";
import { paymentPromptFor } from "@/lib/payments/payment-status";
import {
  applyRefundToPayments,
  grossCollectedAmount,
  isFullyRefunded,
  netCollectedAmount,
  outstandingBalance,
  planRefundAccounting,
  refundedOnPayment,
  refundedTotalAmount,
  shouldCloseOrderAfterRefund,
  type RefundablePayment,
} from "@/lib/payments/refund-accounting";
import { settledAmount } from "@/lib/payments/payment-status";

/**
 * Refund accounting: gross vs net, partial/full, lifecycle, idempotency.
 *
 * The refund lifecycle itself is classified in razorpay-webhook.test.ts; this
 * covers the arithmetic, which is where every accounting defect in this area has
 * lived. All amounts are paise.
 */

let n = 0;
const pass = (label: string) => console.log(`PASS ${++n} ${label}`);

const paid = (
  amount: number,
  refundedAmount = 0,
  id?: string,
): RefundablePayment & { razorpayPaymentId?: string } => ({
  amount,
  status: refundedAmount >= amount && amount > 0 ? "REFUNDED" : "PAID",
  refundedAmount,
  razorpayPaymentId: id ?? `pay_${amount}`,
});

// ── 1. Gross and net are different numbers, and both exist ──────────────────
{
  const payments = [paid(100_000, 30_000)];
  assert.equal(grossCollectedAmount(payments), 100_000, "gross is what Razorpay took");
  assert.equal(refundedTotalAmount(payments), 30_000, "refunded is what came back");
  assert.equal(
    netCollectedAmount(payments),
    70_000,
    "net is what is retained — never confused with gross",
  );
  pass("gross, refunded and net are three distinct figures");
}

// ── 2. grossCollectedAmount agrees with Batch 2's settledAmount ─────────────
{
  // These two functions answer the same question and were originally written by
  // different call sites, which is how they came to disagree in Batch 2. They are
  // pinned together here so they cannot drift again.
  const rows: RefundablePayment[] = [
    { amount: 100_000, status: "PAID", refundedAmount: 0 },
    { amount: 50_000, status: "REFUNDED", refundedAmount: 50_000 },
    { amount: 30_000, status: "PAID", refundedAmount: 10_000 },
    { amount: 99_999, status: "FAILED", refundedAmount: 0 },
    { amount: 12_345, status: "PENDING", refundedAmount: 0 },
  ];
  assert.equal(
    grossCollectedAmount(rows),
    settledAmount(rows),
    "gross must equal settledAmount — refunds do not change whether money arrived",
  );
  assert.equal(grossCollectedAmount(rows), 180_000, "FAILED/PENDING rows never count");
  pass("grossCollectedAmount matches settledAmount (Batch 2 behaviour preserved)");
}

// ── 3. Partial refund ───────────────────────────────────────────────────────
{
  const payment = paid(100_000, 0);
  const plan = planRefundAccounting({
    refundId: "rfnd_PARTIAL",
    refundAmount: 30_000,
    phase: "PROCESSED",
    payment,
    existing: null,
  });
  assert.equal(plan.kind, "REFUND");
  if (plan.kind !== "REFUND") throw new Error("unreachable");
  assert.equal(plan.refundDelta, 30_000, "a new settlement moves exactly its own amount");
  assert.equal(plan.refundTotalAfter, 30_000);
  assert.equal(plan.fullyRefunded, false, "30% of a payment is not a full refund");
  assert.ok(plan.note.includes("Partial refund of ₹300"), plan.note);
  assert.ok(plan.note.includes("₹300 of ₹1,000"), plan.note);
  pass("a partial refund records its amount and stays partial");
}

// ── 4. Full refund ──────────────────────────────────────────────────────────
{
  const plan = planRefundAccounting({
    refundId: "rfnd_FULL",
    refundAmount: 100_000,
    phase: "PROCESSED",
    payment: paid(100_000, 0),
    existing: null,
  });
  if (plan.kind !== "REFUND") throw new Error("unreachable");
  assert.equal(plan.refundDelta, 100_000);
  assert.equal(plan.fullyRefunded, true);
  assert.ok(plan.note.includes("refunded in full: ₹1,000"), plan.note);
  pass("a full refund is recognised and reported as such");
}

// ── 5. Multiple partial refunds accumulate ──────────────────────────────────
{
  // THE CASE THE OLD MODEL COULD NOT EXPRESS. Three refunds on one payment; each
  // contributes only its own amount, and the running total is on the payment row
  // rather than implied by three independent timeline notes.
  const payment = paid(100_000, 0);
  let refunded = 0;
  const steps = [
    ["rfnd_1", 20_000, false],
    ["rfnd_2", 30_000, false],
    ["rfnd_3", 50_000, true],
  ] as const;
  for (const [refundId, amount, expectFull] of steps) {
    const plan = planRefundAccounting({
      refundId,
      refundAmount: amount,
      phase: "PROCESSED",
      payment: { amount: 100_000, status: "PAID", refundedAmount: refunded },
      existing: null,
    });
    if (plan.kind !== "REFUND") throw new Error("unreachable");
    assert.equal(
      plan.refundDelta,
      amount,
      `${refundId} must add only its own amount`,
    );
    refunded = plan.refundTotalAfter;
    assert.equal(plan.fullyRefunded, expectFull, `${refundId} fullness`);
  }
  assert.equal(refunded, 100_000, "the three refunds total the full capture");
  assert.equal(
    netCollectedAmount([{ ...payment, refundedAmount: refunded, status: "REFUNDED" }]),
    0,
    "net is zero once everything is returned",
  );
  pass("three partial refunds accumulate to exactly one full refund");
}

// ── 6. Duplicate events never double-count ──────────────────────────────────
{
  // The redelivery case. Razorpay re-delivers refund.processed freely, and the
  // previous dedupe (matching `rfnd_…` inside the timeline note) was a substring
  // heuristic. This is now a UNIQUE row lookup.
  const settled = { status: "PROCESSED", amount: 30_000 };
  const plan = planRefundAccounting({
    refundId: "rfnd_DUP",
    refundAmount: 30_000,
    phase: "PROCESSED",
    payment: { amount: 100_000, status: "PAID", refundedAmount: 30_000 },
    existing: settled,
  });
  assert.equal(plan.kind, "REFUND_ACK");
  if (plan.kind === "REFUND_ACK") {
    assert.equal(plan.reason, "already-settled");
  }
  pass("a redelivered refund.processed is acknowledged and adds nothing");
}

// ── 7. A refund id that is a prefix of another is a different refund ────────
{
  // The exact defect the substring dedupe had: note "(rfnd_ABC)" matched a note
  // about "rfnd_ABCDEF", so the real refund was silently dropped and its money
  // never came off the payment.
  const plan = planRefundAccounting({
    refundId: "rfnd_ABC",
    refundAmount: 10_000,
    phase: "PROCESSED",
    payment: { amount: 100_000, status: "PAID", refundedAmount: 10_000 },
    // The other, longer refund is on record; this one is not.
    existing: { status: "PROCESSED", amount: 10_000 },
  });
  assert.equal(plan.kind, "REFUND_ACK");
  pass("refund ids are compared for equality, never as substrings");
}

// ── 8. refund.failed moves no money ─────────────────────────────────────────
{
  const payment = { amount: 100_000, status: "PAID" as const, refundedAmount: 20_000 };
  const plan = planRefundAccounting({
    refundId: "rfnd_FAIL",
    refundAmount: 40_000,
    phase: "FAILED",
    payment,
    existing: { status: "CREATED", amount: 40_000 },
  });
  if (plan.kind !== "REFUND") throw new Error("unreachable");
  assert.equal(plan.phase, "FAILED");
  assert.equal(plan.refundDelta, 0, "a failed refund must not move money");
  assert.equal(plan.refundTotalAfter, 20_000, "the refunded total is unchanged");
  assert.equal(plan.fullyRefunded, false, "a failed refund cannot fully refund a payment");
  assert.ok(plan.note.includes("failed"), plan.note);
  pass("refund.failed is recorded but moves no money");
}

// ── 9. refund.created moves no money, and can still settle later ────────────
{
  const created = planRefundAccounting({
    refundId: "rfnd_LIFE",
    refundAmount: 25_000,
    phase: "CREATED",
    payment: { amount: 100_000, status: "PAID", refundedAmount: 0 },
    existing: null,
  });
  if (created.kind !== "REFUND") throw new Error("unreachable");
  assert.equal(created.refundDelta, 0, "initiation is not settlement");
  assert.equal(created.refundTotalAfter, 0);
  assert.ok(created.note.includes("initiated"), created.note);

  // The same id arriving later as refund.processed: it was CREATED, not
  // PROCESSED, so the money still moves exactly once.
  const processed = planRefundAccounting({
    refundId: "rfnd_LIFE",
    refundAmount: 25_000,
    phase: "PROCESSED",
    payment: { amount: 100_000, status: "PAID", refundedAmount: 0 },
    existing: { status: "CREATED", amount: 25_000 },
  });
  if (processed.kind !== "REFUND") throw new Error("unreachable");
  assert.equal(processed.refundDelta, 25_000, "settlement moves the money");
  pass("refund.created records intent; the later refund.processed settles it once");

  // And a CREATED that never settles must not be mistaken for money returned.
  assert.equal(
    netCollectedAmount([
      { amount: 100_000, status: "PAID", refundedAmount: created.refundTotalAfter },
    ]),
    100_000,
    "an initiated refund does not reduce what we hold",
  );
  pass("an initiated-but-unsettled refund does not reduce net collected");
}

// ── 10. refund.failed is itself idempotent ──────────────────────────────────
{
  const plan = planRefundAccounting({
    refundId: "rfnd_FAIL",
    refundAmount: 40_000,
    phase: "FAILED",
    payment: { amount: 100_000, status: "PAID", refundedAmount: 0 },
    existing: { status: "FAILED", amount: 40_000 },
  });
  assert.equal(plan.kind, "REFUND_ACK");
  if (plan.kind === "REFUND_ACK") assert.equal(plan.reason, "already-failed");
  pass("a redelivered refund.failed is acknowledged");
}

// ── 11. Malformed refunds are rejected, not guessed at ──────────────────────
{
  const base = {
    phase: "PROCESSED" as const,
    payment: { amount: 100_000, status: "PAID", refundedAmount: 0 },
    existing: null,
  };
  assert.equal(
    planRefundAccounting({ ...base, refundId: null, refundAmount: 10_000 }).kind,
    "REFUND_ACK",
    "no refund id means no idempotency key",
  );
  assert.equal(
    planRefundAccounting({ ...base, refundId: "rfnd_X", refundAmount: null }).kind,
    "REFUND_ACK",
    "no amount means nothing to record",
  );
  assert.equal(
    planRefundAccounting({ ...base, refundId: "rfnd_X", refundAmount: 0 }).kind,
    "REFUND_ACK",
  );
  assert.equal(
    planRefundAccounting({ ...base, refundId: "rfnd_X", refundAmount: -5 }).kind,
    "REFUND_ACK",
    "a negative refund is nonsense",
  );
  pass("refunds without a usable id or amount are refused");
}

// ── 12. A refund can never exceed the capture ───────────────────────────────
{
  const plan = planRefundAccounting({
    refundId: "rfnd_HUGE",
    refundAmount: 999_999,
    phase: "PROCESSED",
    payment: { amount: 100_000, status: "PAID", refundedAmount: 0 },
    existing: null,
  });
  if (plan.kind !== "REFUND") throw new Error("unreachable");
  assert.equal(plan.refundTotalAfter, 100_000, "clamped to what was captured");
  assert.equal(plan.fullyRefunded, true);
  assert.equal(
    netCollectedAmount([
      { amount: 100_000, status: "REFUNDED", refundedAmount: plan.refundTotalAfter },
    ]),
    0,
    "net never goes negative on a malformed payload",
  );
  pass("a refund larger than the capture is clamped to the capture");
}

// ── 13. Rows written before the migration behave as unrefunded ──────────────
{
  // refundedAmount is a NOT NULL DEFAULT 0 column, so existing rows backfill to
  // zero. Any row that somehow arrives without the field must be read the same
  // way rather than as NaN.
  const legacy: RefundablePayment[] = [{ amount: 100_000, status: "PAID" }];
  assert.equal(refundedOnPayment(legacy[0]), 0);
  assert.equal(netCollectedAmount(legacy), 100_000);
  assert.equal(
    netCollectedAmount([{ amount: 100_000, status: "PAID", refundedAmount: null }]),
    100_000,
    "an explicit null is zero refunded, not an error",
  );
  pass("rows predating the migration read as fully retained");
}

// ── 14. Outstanding balance is net, so refunds cannot cause double collection ─
{
  // THE DEFECT. This used to sum `status === "PAID"` only, so a fully refunded
  // payment vanished from the paid sum and the balance snapped back to the full
  // order total — asking a customer who had just been refunded in full to pay
  // the whole amount again.
  const total = 100_000;
  assert.equal(
    outstandingBalance({ total, payments: [{ amount: 100_000, status: "PAID" }] }),
    0,
    "nothing owed when the full amount is retained",
  );
  assert.equal(
    outstandingBalance({
      total,
      payments: [{ amount: 100_000, status: "REFUNDED", refundedAmount: 100_000 }],
    }),
    total,
    "a fully refunded payment leaves the whole amount outstanding",
  );
  assert.equal(
    outstandingBalance({
      total,
      payments: [{ amount: 100_000, status: "PAID", refundedAmount: 30_000 }],
    }),
    30_000,
    "a partial refund increases what is owed by exactly the refund",
  );
  assert.equal(
    outstandingBalance({
      total,
      payments: [
        { amount: 50_000, status: "PAID", refundedAmount: 20_000 },
        { amount: 20_000, status: "PAID", refundedAmount: 0 },
      ],
    }),
    50_000,
    "the balance sums net across partial captures",
  );
  assert.equal(
    outstandingBalance({ total, payments: [] }),
    total,
    "an unpaid order owes everything",
  );
  assert.equal(
    outstandingBalance({
      total,
      payments: [{ amount: 200_000, status: "PAID", refundedAmount: 0 }],
    }),
    0,
    "never negative when a ledger over-covers the total",
  );
  pass("outstanding balance is net of refunds and never goes negative");
}

// ── 15. isFullyRefunded is about retention, not about one payment ───────────
{
  // THE DEFECT. The old rule marked an order REFUNDED when a single refund
  // covered a single payment. On a 100 000 order whose only capture was 50 000,
  // refunding that 50 000 closed the order as REFUNDED — wrong as accounting, and
  // it stranded a genuinely outstanding 50 000.
  const partialCapture = [{ amount: 50_000, status: "PAID", refundedAmount: 0 }];
  const afterRefund = [{ amount: 50_000, status: "REFUNDED", refundedAmount: 50_000 }];
  assert.equal(isFullyRefunded(partialCapture), false);
  assert.equal(
    isFullyRefunded(afterRefund),
    true,
    "every paise collected came back, so the order retains nothing",
  );
  assert.equal(
    isFullyRefunded([{ amount: 50_000, status: "PAID", refundedAmount: 20_000 }]),
    false,
    "money still retained means not fully refunded",
  );
  assert.equal(
    isFullyRefunded([]),
    false,
    "nothing was ever collected, so nothing was refunded",
  );
  pass("isFullyRefunded means nothing retained, not one payment returned");
}

// ── 16. applyRefundToPayments projects the post-refund ledger ───────────────
{
  const rows = [
    { amount: 50_000, status: "PAID", refundedAmount: 0, razorpayPaymentId: "pay_A" },
    { amount: 50_000, status: "PAID", refundedAmount: 0, razorpayPaymentId: "pay_B" },
  ];
  const partial = applyRefundToPayments(rows, {
    razorpayPaymentId: "pay_A",
    status: "PAID",
    refundedAmount: 50_000,
  });
  assert.equal(partial[0].refundedAmount, 50_000);
  assert.equal(partial[0].status, "PAID", "a partial refund leaves the payment PAID");
  assert.equal(partial[1].refundedAmount, 0, "the other payment is untouched");
  assert.equal(
    netCollectedAmount(partial),
    50_000,
    "only the refunded payment's face value is discounted",
  );

  const full = applyRefundToPayments(rows, {
    razorpayPaymentId: "pay_A",
    status: "REFUNDED",
    refundedAmount: 50_000,
  });
  assert.equal(full[0].status, "REFUNDED");
  assert.equal(
    isFullyRefunded(full),
    false,
    "pay_B still retains money, so the order is not fully refunded",
  );

  // Both returned → nothing retained.
  const both = applyRefundToPayments(
    applyRefundToPayments(rows, {
      razorpayPaymentId: "pay_A",
      status: "REFUNDED",
      refundedAmount: 50_000,
    }),
    { razorpayPaymentId: "pay_B", status: "REFUNDED", refundedAmount: 50_000 },
  );
  assert.equal(isFullyRefunded(both), true);

  // A manually recorded payment has no razorpayPaymentId and must not be matched
  // by accident — otherwise someone else's refund corrupts it.
  const manual = applyRefundToPayments(
    [{ amount: 100_000, status: "PAID", refundedAmount: 0, razorpayPaymentId: null }],
    { razorpayPaymentId: "pay_A", status: "REFUNDED", refundedAmount: 50_000 },
  );
  assert.equal(manual[0].status, "PAID", "a manual payment is not matched by a Razorpay refund");
  assert.equal(manual[0].refundedAmount, 0);

  // Clamped, same as the plan.
  const clamped = applyRefundToPayments(rows, {
    razorpayPaymentId: "pay_A",
    status: "REFUNDED",
    refundedAmount: 999_999,
  });
  assert.equal(clamped[0].refundedAmount, 50_000);
  pass("applyRefundToPayments projects the ledger without touching other payments");
}

// ── 17. A refund against an unrecorded capture ──────────────────────────────
{
  // The capture event was lost, or the webhook secret was unconfigured at the
  // time. The refund is still real — the merchant still owes the customer the
  // money — so it is recorded against the order, but there is no Payment row to
  // increment and nothing is invented.
  const plan = planRefundAccounting({
    refundId: "rfnd_ORPHAN",
    refundAmount: 40_000,
    phase: "PROCESSED",
    payment: null,
    existing: null,
  });
  if (plan.kind !== "REFUND") throw new Error("unreachable");
  assert.equal(plan.paymentId, null, "no payment row is invented");
  assert.equal(plan.refundDelta, 0, "there is nothing to increment");
  assert.equal(plan.refundTotalAfter, 0);
  assert.equal(plan.fullyRefunded, false, "an unknown payment cannot be declared refunded");
  pass("a refund for an unrecorded capture is recorded without inventing a payment");
}

// ── 19. F1: PROCESSED is terminal — a later refund.failed cannot undo it ─────
{
  // THE DEFECT. The FAILED branch used to be tested BEFORE the
  // `existing.status === "PROCESSED"` guard, so a delayed or replayed
  // `refund.failed` for a refund that had already settled fell straight through to
  // the FAILED branch and returned a WRITE plan. The route upserts
  // `status: phase` unconditionally, so the ledger then claimed that a refund
  // which returned money had failed.
  //
  // No money moved (refundDelta is 0 either way), so the balances were never at
  // risk. The claim was: an admin reading the ledger to decide whether a customer
  // still needs refunding would have been told the money never went back.
  const settled = {
    status: "PROCESSED",
    amount: 30_000,
    payment: { amount: 100_000, status: "PAID", refundedAmount: 30_000 },
  };

  const plan = planRefundAccounting({
    refundId: "rfnd_SETTLED",
    refundAmount: 30_000,
    phase: "FAILED",
    payment: settled.payment,
    existing: { status: "PROCESSED", amount: 30_000 },
  });
  assert.equal(plan.kind, "REFUND_ACK", "a settled refund must never be downgraded");
  if (plan.kind === "REFUND_ACK") {
    assert.equal(
      plan.reason,
      "already-settled",
      "PROCESSED is terminal regardless of the incoming phase",
    );
  }

  // Same for the other two non-settled phases, and for a CREATED that arrives
  // late. The guard must not care what is arriving at all.
  for (const phase of ["CREATED", "PROCESSED", "FAILED"] as const) {
    const p = planRefundAccounting({
      refundId: "rfnd_TERMINAL",
      refundAmount: 30_000,
      phase,
      payment: settled.payment,
      existing: { status: "PROCESSED", amount: 30_000 },
    });
    assert.equal(p.kind, "REFUND_ACK", `${phase} after PROCESSED must ack`);
    if (p.kind === "REFUND_ACK") {
      assert.equal(p.reason, "already-settled", phase);
    }
  }
  pass("a refund already marked PROCESSED is never downgraded by a later event");
}

// ── 20. F5: a redelivered refund.created writes nothing at all ───────────────
{
  // THE DEFECT. Only PROCESSED and FAILED had an "already handled" guard. A
  // repeated `refund.created` matched neither, returned a write plan, and the
  // route appends a timeline entry for every plan it executes — so one
  // `refund.created` delivered five times produced five customer-visible
  // "Refund initiated" entries on the order.
  const existing = { status: "CREATED", amount: 30_000 };
  const payment = { amount: 100_000, status: "PAID", refundedAmount: 0 };

  const plan = planRefundAccounting({
    refundId: "rfnd_INIT",
    refundAmount: 30_000,
    phase: "CREATED",
    payment,
    existing,
  });
  assert.equal(
    plan.kind,
    "REFUND_ACK",
    "a refund already recorded as CREATED has nothing left to write",
  );
  if (plan.kind === "REFUND_ACK") {
    assert.equal(plan.reason, "already-recorded");
  }

  // Batch 4 already covered FAILED-after-FAILED; keep both pinned.
  const failedAgain = planRefundAccounting({
    refundId: "rfnd_INIT",
    refundAmount: 30_000,
    phase: "FAILED",
    payment,
    existing: { status: "FAILED", amount: 30_000 },
  });
  assert.equal(failedAgain.kind, "REFUND_ACK");
  if (failedAgain.kind === "REFUND_ACK") {
    assert.equal(failedAgain.reason, "already-failed");
  }
  pass("a duplicate refund.created writes nothing, so no duplicate timeline entry");
}

// ── 21. F5 (cont): the lifecycle transitions that MUST still write ───────────
{
  // The guard above must not freeze a refund at CREATED forever. These are the
  // transitions that carry information and have to keep working.
  const cases: Array<[string, string, string]> = [
    ["CREATED", "PROCESSED", "settlement advances the stored phase"],
    ["CREATED", "FAILED", "failure advances the stored phase"],
    ["FAILED", "PROCESSED", "a retry after a failure can still settle"],
  ];
  for (const [from, phase, why] of cases) {
    const plan = planRefundAccounting({
      refundId: "rfnd_ADV",
      refundAmount: 30_000,
      phase: phase as "CREATED" | "PROCESSED" | "FAILED",
      payment: { amount: 100_000, status: "PAID", refundedAmount: 0 },
      existing: { status: from, amount: 30_000 },
    });
    assert.equal(plan.kind, "REFUND", why);
  }

  // And FAILED must still move no money, whatever it is transitioning from.
  const failedMoney = planRefundAccounting({
    refundId: "rfnd_ADV",
    refundAmount: 30_000,
    phase: "FAILED",
    payment: { amount: 100_000, status: "PAID", refundedAmount: 0 },
    existing: { status: "CREATED", amount: 30_000 },
  });
  assert.equal(failedMoney.kind, "REFUND");
  if (failedMoney.kind === "REFUND") {
    assert.equal(failedMoney.refundDelta, 0, "a failed refund moves no money");
    assert.equal(failedMoney.fullyRefunded, false);
  }
  pass("real lifecycle transitions still write; failed still moves no money");
}

// ── 22. F2: a refund with no amount of its own must move no money ───────────
{
  // THE DEFECT. planWebhookAction passed
  // `refundAmount: c.refundAmount ?? c.cumulativeRefunded`, and
  // `cumulativeRefunded` is Razorpay's `payment.entity.amount_refunded` — the
  // running total across EVERY refund on that payment, not this one's value. On
  // the second refund of a payment the plan was handed the cumulative figure and
  // treated it as a delta.
  //
  // With 30 000 already returned, a further 30 000 refund whose payload omitted
  // `refund.entity.amount` was applied as a 60 000 delta, taking the payment to
  // 90 000 refunded. The ledger claimed 900 paise came back when 600 had.
  const plan = planRefundAccounting({
    refundId: "rfnd_NOAMT",
    refundAmount: null, // the individual amount was absent
    phase: "PROCESSED",
    payment: { amount: 100_000, status: "PAID", refundedAmount: 30_000 },
    existing: null,
  });
  assert.equal(plan.kind, "REFUND_ACK", "an unpriceable refund cannot be applied");
  if (plan.kind === "REFUND_ACK") {
    assert.equal(plan.reason, "missing-amount");
  }

  // A cumulative figure must not be laundered in as this refund's own amount,
  // even when one is offered. 60 000 is the running total; this refund is 30 000.
  const secondRefund = planRefundAccounting({
    refundId: "rfnd_2ND",
    refundAmount: 30_000,
    phase: "PROCESSED",
    payment: { amount: 100_000, status: "PAID", refundedAmount: 30_000 },
    existing: null,
  });
  assert.equal(secondRefund.kind, "REFUND");
  if (secondRefund.kind === "REFUND") {
    assert.equal(
      secondRefund.refundDelta,
      30_000,
      "the delta is THIS refund's amount, not the cumulative 60 000",
    );
    assert.equal(secondRefund.refundTotalAfter, 60_000, "30 000 + 30 000");
  }

  // Zero is not a price either.
  const zero = planRefundAccounting({
    refundId: "rfnd_ZERO",
    refundAmount: 0,
    phase: "PROCESSED",
    payment: { amount: 100_000, status: "PAID", refundedAmount: 0 },
    existing: null,
  });
  assert.equal(zero.kind, "REFUND_ACK");
  if (zero.kind === "REFUND_ACK") assert.equal(zero.reason, "missing-amount");
  pass("a refund with no amount of its own moves no money and is acknowledged");
}

// ── 23. F6/F7: closing the order is not the same as holding no money ────────
{
  // THE DEFECT. The route closed an order whenever `isFullyRefunded` was true.
  // That is true for two unrelated situations:
  //
  //   A. Paid in full (100 000) and all of it returned. Owed nothing, ever.
  //   B. Only ever captured 50 000 of a 100 000 order, and that 50 000 returned.
  //      Nothing is retained — but 100 000 is still owed, because the rest was
  //      never paid.
  //
  // B was closed as REFUNDED, which pay-inline rejects outright, so the balance
  // was uncollectable. An admin could not clear it either: `derivePaymentStatus`
  // returns REFUNDED for a REFUNDED order regardless of what is recorded.
  const partialCaptureReturned = [
    { amount: 50_000, status: "REFUNDED", refundedAmount: 50_000 },
  ];
  assert.equal(
    isFullyRefunded(partialCaptureReturned),
    true,
    "nothing is retained, so isFullyRefunded is still true",
  );
  assert.equal(
    shouldCloseOrderAfterRefund({ total: 100_000, payments: partialCaptureReturned }),
    false,
    "but the order never held its full worth, so it must NOT close",
  );
  assert.equal(
    outstandingBalance({ total: 100_000, payments: partialCaptureReturned }),
    100_000,
    "and the whole total is genuinely still owed",
  );

  // A: paid in full and returned in full. Closed, and stays closed. This is the
  // duplicate collection the gate exists to prevent.
  const fullyPaidReturned = [
    { amount: 100_000, status: "REFUNDED", refundedAmount: 100_000 },
  ];
  assert.equal(
    shouldCloseOrderAfterRefund({ total: 100_000, payments: fullyPaidReturned }),
    true,
    "paid in full then returned in full: the order is finished",
  );
  assert.equal(
    outstandingBalance({ total: 100_000, payments: fullyPaidReturned }),
    100_000,
    "net is zero, yet this must never become collectable again",
  );

  // Third case: paid in full, only partly returned. Money was genuinely given
  // back, so the order must not close, and the balance must be net.
  const paidPartialReturn = [
    { amount: 100_000, status: "PAID", refundedAmount: 30_000 },
  ];
  assert.equal(
    shouldCloseOrderAfterRefund({ total: 100_000, payments: paidPartialReturn }),
    false,
    "30 000 was handed back, so this is not a closed order",
  );
  assert.equal(
    outstandingBalance({ total: 100_000, payments: paidPartialReturn }),
    30_000,
    "net retained is 70 000 of a 100 000 order, so 30 000 is owed",
  );

  // Nothing was ever collected: a refund cannot close an order that never took
  // money, and there is no payment to have been refunded.
  assert.equal(
    shouldCloseOrderAfterRefund({ total: 100_000, payments: [] }),
    false,
    "nothing collected means nothing refunded",
  );
  assert.equal(
    shouldCloseOrderAfterRefund({ total: 0, payments: [] }),
    false,
    "a zero-total order has nothing to refund",
  );

  // Multi-capture: the order as a whole reached its total, so a full return of
  // one capture does not close it while another still holds money.
  const twoCapturesOneReturned = [
    { amount: 60_000, status: "REFUNDED", refundedAmount: 60_000 },
    { amount: 40_000, status: "PAID", refundedAmount: 0 },
  ];
  assert.equal(
    shouldCloseOrderAfterRefund({
      total: 100_000,
      payments: twoCapturesOneReturned,
    }),
    false,
    "40 000 is still retained, so the order is not finished",
  );
  pass("an order closes only if it had actually held its full worth");
}

{
  // THE DEFECT, part 2. The button was labelled with the order TOTAL while
  // pay-inline charges the outstanding balance. A customer holding a partially
  // paid order was told "Pay ₹1,000.00 now", entered ₹1,000.00, and was then
  // charged a different figure — with no line between the two numbers explaining
  // why. The amount shown and the amount charged have to be the same number.
  const partial = paymentPromptFor({
    paymentStatus: "PARTIALLY_PAID",
    total: 100_000,
    outstanding: 30_000,
  });
  assert.equal(partial.kind, "payable");
  if (partial.kind === "payable") {
    assert.equal(partial.amountDue, 30_000, "the shown amount is the balance charged");
    assert.notEqual(
      partial.amountDue,
      100_000,
      "never the order total",
    );
  }

  // A partly-paid order whose captured money was then partly refunded. This is
  // the case the total could never express: 100 000 order, 100 000 collected,
  // 30 000 returned. Net, 30 000 is genuinely owed again.
  const goodwilled = paymentPromptFor({
    paymentStatus: "PARTIALLY_PAID",
    total: 100_000,
    outstanding: outstandingBalance({
      total: 100_000,
      payments: [{ amount: 100_000, status: "PAID", refundedAmount: 30_000 }],
    }),
  });
  assert.equal(goodwilled.kind, "payable");
  if (goodwilled.kind === "payable") {
    assert.equal(goodwilled.amountDue, 30_000, "net of refunds");
  }

  // Nothing collected at all: the whole total is owed, and that is the number to
  // show — not a zero, and not a stale balance.
  const unpaid = paymentPromptFor({ paymentStatus: "PENDING", total: 100_000, outstanding: 100_000 });
  assert.equal(unpaid.kind, "payable");
  if (unpaid.kind === "payable") assert.equal(unpaid.amountDue, 100_000);
  pass("the amount shown is the outstanding balance, net of refunds");
}

console.log(`\nPASS all ${n} refund accounting tests`);
// ── 14. Reconciliation when local payment missing ────────────────────────
{
  const plan = planRefundAccounting({
    refundId: "rfnd_MISSING_PAY",
    refundAmount: 3000,
    phase: "PROCESSED",
    payment: null,
    existing: null,
  });
  assert.equal(plan.kind, "REFUND");
  if (plan.kind === "REFUND") {
    assert.equal(plan.paymentId, null, "no local payment => paymentId null");
    assert.equal(plan.refundDelta, 0, "no local payment => no delta applied");
  }
  pass("refund processed without local payment records intent without moving money");
}
