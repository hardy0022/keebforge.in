import type { OrderStatus } from "@prisma/client";

/**
 * Single source of truth for "how much money has this order actually taken in".
 *
 * Three call sites used to answer that question independently and disagree:
 * the Razorpay webhook wrote `order.total` onto every payment row, /verify did
 * the same, and the admin amount editor summed only `PAID` rows. On a
 * partially-paid order the first two over-report (the balance capture is
 * recorded as a second full payment) and the third under-reports a refunded
 * order as unpaid. The disagreement is what let an admin amount edit silently
 * turn a REFUNDED order back into PENDING, and what stops a customer from ever
 * being able to pay the remainder.
 *
 * Pure and prisma-free so both the webhook and the admin actions can share it
 * and the rules stay unit-testable.
 */

/** The subset of a `Payment` row these helpers need. */
export type SettledPayment = { amount: number; status: string };

/** Values Prisma accepts for `Order.paymentStatus`. */
export type DerivedPaymentStatus =
  | "PAID"
  | "PARTIALLY_PAID"
  | "PENDING"
  | "REFUNDED";

/** Order statuses that mean the order has not had its money settled yet. */
const PRE_PAYMENT_ORDER_STATUSES = new Set([
  "ORDER_RECEIVED",
  "ORDER_CONFIRMED",
  "PAYMENT_PENDING",
  "PAYMENT_RECEIVED",
]);

function positivePaise(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

/**
 * Money that has actually reached the account, in paise.
 *
 * `REFUNDED` rows count. A refund means the money *was* collected and then sent
 * back, and the ledger has no separate gross-collected figure — the schema has
 * no `refundedAmount` column to carry the difference. Leaving refunded rows out
 * makes a refunded order look unpaid, which is exactly how editing its amounts
 * used to reset it to PENDING and invite a second collection.
 */
export function settledAmount(
  payments: readonly SettledPayment[],
): number {
  let total = 0;
  for (const payment of payments) {
    if (payment.status === "PAID" || payment.status === "REFUNDED") {
      total += payment.amount;
    }
  }
  return total;
}

/**
 * The amount a single capture represents, in paise.
 *
 * Never `order.total`. Pay-inline creates one Razorpay order per attempt for the
 * *outstanding balance*, so a second capture legitimately covers less than the
 * order total; recording the total for it makes the paid sum overshoot, which
 * hides the remaining balance from the customer and under-collects from the
 * merchant.
 *
 * Precedence: the amount Razorpay reports on the payment itself (webhook, most
 * authoritative) → the amount the Razorpay order was created for (stored on
 * billingDetails, what /verify can trust) → the computed outstanding balance.
 */
export function capturedAmount(args: {
  /** Order total in paise. */
  total: number;
  /** Money already settled on this order before this capture. */
  settled: number;
  /** `payment.entity.amount` from a Razorpay payload, paise. */
  reported?: number | null;
  /** `billingDetails.razorpayOrderAmount`, paise. */
  razorpayOrderAmount?: number | null;
}): number {
  const outstanding = Math.max(0, args.total - args.settled);
  const stated =
    positivePaise(args.reported) ??
    positivePaise(args.razorpayOrderAmount) ??
    outstanding;
  // Clamped to the order total: an inflated ledger entry would let a bad payload
  // mark an order fully paid that was never fully paid. A conservative amount
  // leaves the balance visible and payable; an inflated one hides it.
  return args.total > 0 ? Math.min(stated, args.total) : stated;
}

/**
 * Derive `Order.paymentStatus` from the money that has actually arrived.
 *
 * `current` is honoured for REFUNDED: a refund is a fact about the order, not a
 * function of the current numbers, so editing the total or recording another
 * payment must not erase it.
 */
export function derivePaymentStatus(
  settled: number,
  total: number,
  current?: string | null,
): DerivedPaymentStatus {
  if (current === "REFUNDED") return "REFUNDED";
  if (total > 0 && settled >= total) return "PAID";
  if (settled > 0) return "PARTIALLY_PAID";
  return "PENDING";
}

/**
 * The order status to write when a capture lands.
 *
 * Only advances an order that is still in its payment stage. The webhook used to
 * rewrite `status: "PAYMENT_RECEIVED"` unconditionally on every capture, so a
 * redelivered event arriving after an admin had pushed the order to
 * WORK_STARTED dragged it backwards — the same class of bug as the replayed
 * `payment.failed` downgrade, on the other field.
 */
export function orderStatusAfterCapture(
  current: OrderStatus,
  fullyPaid: boolean,
): OrderStatus {
  if (!fullyPaid) return current;
  return PRE_PAYMENT_ORDER_STATUSES.has(current) ? "PAYMENT_RECEIVED" : current;
}

/**
 * What a customer-facing page should offer for an order's payment.
 *
 * Batch 5A (F8). This exists as a pure function rather than inline JSX because the
 * rule is a safety property, not a presentation detail: a pay control must never
 * appear for an order that cannot actually be paid, and the figure it shows must be
 * the figure that will be charged.
 *
 * Two defects it replaces. The tracking page rendered its pay button whenever the
 * order was not literally `PAID`, so a REFUNDED order — which pay-inline rejects
 * with "already paid" — was shown an enabled control that could only ever fail, to
 * a customer who had just been handed money back. And the button was labelled with
 * the order TOTAL while pay-inline charges the outstanding balance, so a partially
 * paid order was told it owed everything and then charged the remainder.
 *
 * `outstanding` must come from `outstandingBalance` in refund-accounting, i.e. net
 * of refunds. Passing a gross figure here reintroduces the duplicate-collection
 * bug one layer up.
 */
export type PaymentPrompt =
  | { kind: "paid"; label: "Paid ✓" }
  | { kind: "refunded"; label: "Refunded" }
  | { kind: "awaiting-pricing"; label: "Payment Pending" }
  | { kind: "settled"; label: "Paid ✓" }
  | { kind: "payable"; amountDue: number };

export function paymentPromptFor(args: {
  paymentStatus: string;
  /** Order total, paise. Zero means final pricing is not in yet. */
  total: number;
  /** Net outstanding balance, paise. */
  outstanding: number;
}): PaymentPrompt {
  // Order status wins first: PAID and REFUNDED are both terminal, and neither may
  // be re-entered by a stale balance.
  if (args.paymentStatus === "PAID") return { kind: "paid", label: "Paid ✓" };
  if (args.paymentStatus === "REFUNDED") return { kind: "refunded", label: "Refunded" };
  // No price yet — there is nothing to charge, so nothing may be offered.
  if (args.total <= 0) return { kind: "awaiting-pricing", label: "Payment Pending" };
  // Settled by the payment rows even though the order status has not caught up.
  if (args.outstanding <= 0) return { kind: "settled", label: "Paid ✓" };
  return { kind: "payable", amountDue: args.outstanding };
}
