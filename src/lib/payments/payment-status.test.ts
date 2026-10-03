import assert from "node:assert/strict";
import {
  capturedAmount,
  derivePaymentStatus,
  orderStatusAfterCapture,
  paymentPromptFor,
  settledAmount,
} from "@/lib/payments/payment-status";

// The three payment-settling paths (webhook, /verify, admin actions) share these
// rules because they used to each roll their own and disagree. Every case below
// is a bug that reached production or is reachable today.
//
// All amounts are paise, as stored in the schema.

let n = 0;
function pass(label: string) {
  console.log(`PASS ${++n} ${label}`);
}

// ── settledAmount ───────────────────────────────────────────────────────────

{
  const paid = settledAmount([
    { amount: 40_000, status: "PAID" },
    { amount: 60_000, status: "PAID" },
  ]);
  assert.equal(paid, 100_000);
  pass("settledAmount sums every PAID row");
}

{
  // The #8 defect: a refunded order paid ₹1,000 and got it all back. Counting
  // only PAID rows made the sum 0, so the admin amount editor derived PENDING and
  // re-opened the order for collection.
  const refunded = settledAmount([{ amount: 100_000, status: "REFUNDED" }]);
  assert.equal(refunded, 100_000, "a REFUNDED row is money that WAS collected");
  pass("settledAmount counts REFUNDED rows as collected");
}

{
  assert.equal(
    settledAmount([
      { amount: 50_000, status: "PAID" },
      { amount: 50_000, status: "REFUNDED" },
      { amount: 999, status: "FAILED" },
      { amount: 999, status: "PENDING" },
    ]),
    100_000,
    "FAILED and PENDING attempts are not collected money",
  );
  pass("settledAmount ignores FAILED and PENDING attempts");
}

assert.equal(settledAmount([]), 0);
pass("settledAmount on an order with no payments is 0");

// ── capturedAmount ──────────────────────────────────────────────────────────

{
  // First payment on a ₹1,000 order: the full total.
  assert.equal(
    capturedAmount({ total: 100_000, settled: 0, reported: 100_000 }),
    100_000,
  );
  pass("capturedAmount on a first full payment is the full total");
}

{
  // THE #6 DEFECT. pay-inline opens one Razorpay order per attempt for the
  // outstanding balance, so this capture is worth ₹500. The webhook used to
  // write order.total here, which made the paid sum 150,000 for a 100,000 order:
  // the customer was shown as fully paid while ₹500 was never collected.
  assert.equal(
    capturedAmount({ total: 100_000, settled: 50_000, reported: 50_000 }),
    50_000,
  );
  pass("capturedAmount on a balance capture is the balance, not the total");
}

{
  // Payload with no amount (shouldn't happen, but must not write garbage).
  assert.equal(
    capturedAmount({ total: 100_000, settled: 50_000, reported: null }),
    50_000,
    "falls back to the computed outstanding balance",
  );
  pass("capturedAmount falls back to the outstanding balance");
}

{
  // /verify has no amount from Razorpay; the Razorpay order's own amount is the
  // authoritative figure it can trust.
  assert.equal(
    capturedAmount({
      total: 100_000,
      settled: 0,
      razorpayOrderAmount: 40_000,
    }),
    40_000,
  );
  pass("capturedAmount uses the Razorpay order amount when no payload amount exists");
}

{
  // Precedence: the payload is more authoritative than the stored order amount.
  assert.equal(
    capturedAmount({
      total: 100_000,
      settled: 0,
      reported: 60_000,
      razorpayOrderAmount: 40_000,
    }),
    60_000,
  );
  pass("capturedAmount prefers the payload amount over the stored order amount");
}

{
  // A hostile or buggy payload must not be able to mark an order fully paid.
  assert.equal(
    capturedAmount({ total: 100_000, settled: 0, reported: 999_999 }),
    100_000,
  );
  pass("capturedAmount clamps an inflated payload to the order total");
}

{
  assert.equal(
    capturedAmount({ total: 100_000, settled: 50_000, reported: 0 }),
    50_000,
    "a zero amount is nonsense, not a zero payment",
  );
  assert.equal(
    capturedAmount({ total: 100_000, settled: 50_000, reported: -5 }),
    50_000,
  );
  pass("capturedAmount ignores zero and negative reported amounts");
}

{
  // A zero-total order must not be clamped to a zero payment.
  assert.equal(capturedAmount({ total: 0, settled: 0, reported: 50_000 }), 50_000);
  pass("capturedAmount does not clamp when the order total is zero");
}

{
  // Over-collection guard: settled already exceeds total (a corrected total).
  assert.equal(
    capturedAmount({ total: 100_000, settled: 120_000, reported: null }),
    0,
  );
  pass("capturedAmount is 0 when nothing is outstanding");
}

// ── derivePaymentStatus ─────────────────────────────────────────────────────

assert.equal(derivePaymentStatus(100_000, 100_000), "PAID");
assert.equal(derivePaymentStatus(150_000, 100_000), "PAID");
pass("derivePaymentStatus is PAID once the order is fully covered");

assert.equal(derivePaymentStatus(40_000, 100_000), "PARTIALLY_PAID");
pass("derivePaymentStatus is PARTIALLY_PAID on a part payment");

assert.equal(derivePaymentStatus(0, 100_000), "PENDING");
pass("derivePaymentStatus is PENDING with nothing collected");

assert.equal(derivePaymentStatus(0, 0), "PENDING");
pass("derivePaymentStatus on a zero-total order with nothing collected is PENDING");

{
  // THE #8 DEFECT, at the level it actually bit: an admin correcting the total
  // on a fully refunded order used to compute 0 PAID against the new total and
  // overwrite REFUNDED with PENDING.
  assert.equal(derivePaymentStatus(100_000, 120_000, "REFUNDED"), "REFUNDED");
  assert.equal(derivePaymentStatus(0, 0, "REFUNDED"), "REFUNDED");
  pass("derivePaymentStatus never un-refunds a REFUNDED order");
}

{
  assert.equal(derivePaymentStatus(100_000, 100_000, "PENDING"), "PAID");
  pass("derivePaymentStatus still promotes a PENDING order to PAID");
}

{
  // A refund paid in full then partially re-collected: the order keeps the
  // refund fact rather than being reopened for collection.
  assert.equal(
    derivePaymentStatus(100_000, 100_000, "REFUNDED"),
    "REFUNDED",
  );
  pass("derivePaymentStatus keeps REFUNDED even when re-collected to the total");
}

// ── orderStatusAfterCapture ─────────────────────────────────────────────────

assert.equal(orderStatusAfterCapture("PAYMENT_PENDING", true), "PAYMENT_RECEIVED");
assert.equal(orderStatusAfterCapture("ORDER_RECEIVED", true), "PAYMENT_RECEIVED");
assert.equal(orderStatusAfterCapture("ORDER_CONFIRMED", true), "PAYMENT_RECEIVED");
pass("orderStatusAfterCapture advances an order that is still awaiting payment");

{
  // Same class as the replayed-failure downgrade, on the other field: the
  // webhook rewrote status: "PAYMENT_RECEIVED" unconditionally, so a
  // redelivered capture arriving after the workshop started the job dragged the
  // order back and reopened it as paid-and-waiting.
  assert.equal(orderStatusAfterCapture("WORK_STARTED", true), "WORK_STARTED");
  assert.equal(orderStatusAfterCapture("COMPLETED", true), "COMPLETED");
  assert.equal(orderStatusAfterCapture("PARTS_BOOKED", true), "PARTS_BOOKED");
  pass("orderStatusAfterCapture never drags a progressed order backwards");
}

{
  // A partial capture leaves the order where it is — the balance is still owed.
  assert.equal(
    orderStatusAfterCapture("PAYMENT_PENDING", false),
    "PAYMENT_PENDING",
  );
  assert.equal(orderStatusAfterCapture("WORK_STARTED", false), "WORK_STARTED");
  pass("orderStatusAfterCapture leaves the status alone for a partial capture");
}

// ── paymentPromptFor (F8) ───────────────────────────────────────────────────
{
  // THE DEFECT, part 1. The tracking page rendered its pay button whenever the
  // order was not literally `PAID`, and its badge read "Payment Pending" for
  // anything else. A REFUNDED order therefore advertised an enabled pay control
  // to a customer who had just been handed money back — and clicking it could
  // only ever produce "Order is already paid" from pay-inline. The control was
  // not broken; it was a lie about the state of the order.
  assert.equal(paymentPromptFor({ paymentStatus: "PAID", total: 100_000, outstanding: 100_000 }).kind,
    "paid", "PAID never offers payment, even if the balance looks outstanding");
  assert.equal(paymentPromptFor({ paymentStatus: "REFUNDED", total: 100_000, outstanding: 100_000 }).kind,
    "refunded", "a REFUNDED order must never offer payment");
  assert.equal(paymentPromptFor({ paymentStatus: "REFUNDED", total: 100_000, outstanding: 0 }).kind,
    "refunded", "REFUNDED stays refunded whatever the arithmetic says");

  // A zero-total order has no price yet. Offering a payment would be offering to
  // charge an amount nobody agreed to.
  assert.equal(paymentPromptFor({ paymentStatus: "PENDING", total: 0, outstanding: 0 }).kind,
    "awaiting-pricing", "no price yet means nothing to charge");

  // Settled by the payment rows while the order status has not caught up. The
  // customer must not be shown a control the server would refuse.
  assert.equal(paymentPromptFor({ paymentStatus: "PENDING", total: 100_000, outstanding: 0 }).kind,
    "settled", "a zero balance means nothing is owed, whatever the order status says");
  assert.equal(paymentPromptFor({ paymentStatus: "PARTIALLY_PAID", total: 100_000, outstanding: 0 }).kind,
    "settled", "PARTIALLY_PAID with no balance is settled");

  pass("no pay control is offered for an order that cannot be paid");
}

{
  // A payable prompt must never carry a zero amount. A control that renders as
  // "Pay ₹0.00" is the duplicate collection the whole refund model exists to
  // stop, and it would get past every caller that only checked `kind === "payable"`.
  for (const outstanding of [1, 50, 99_999]) {
    const p = paymentPromptFor({ paymentStatus: "PARTIALLY_PAID", total: 100_000, outstanding });
    assert.equal(p.kind, "payable");
    if (p.kind === "payable") assert.ok(p.amountDue > 0, `${outstanding} must render positive`);
  }
  // The boundary itself falls on the settled side, not the payable side.
  assert.equal(
    paymentPromptFor({ paymentStatus: "PARTIALLY_PAID", total: 100_000, outstanding: 0 }).kind,
    "settled",
    "zero is never payable",
  );
  pass("a payable prompt never carries a zero amount");
}

console.log(`\nPASS all ${n} payment status tests`);