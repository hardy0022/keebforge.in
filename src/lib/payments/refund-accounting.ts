import { formatINR } from "@/lib/utils/money";

/**
 * Refund accounting: gross collected vs net retained.
 *
 * Batch 2 introduced `settledAmount` in payment-status.ts to answer "how much did
 * this order take in", and its own comment recorded the limitation:
 *
 *   "the schema has no refundedAmount column to carry the difference"
 *
 * So gross and net were the same number, in every consumer. That is fine for
 * deciding PAID (money did arrive) and wrong for everything about balance:
 *
 *   - pay-inline summed only `status === "PAID"`, so a fully refunded payment
 *     dropped out of the paid sum and the outstanding balance jumped back to the
 *     full order total.
 *   - the admin amount editor summed PAID + REFUNDED, so it never saw the return
 *     and would happily record a manual payment on top of money already given
 *     back.
 *
 * Both are the same defect wearing different clothes: a refund is a fact about
 * the order's money, and nothing recorded it as one. This module is that record's
 * arithmetic. Pure and prisma-free so the webhook, the admin actions and the
 * tests all share one implementation of "what is still owed".
 *
 * ── Gross vs net ───────────────────────────────────────────────────────────
 *
 *   gross collected — money Razorpay took. Sum of every PAID and REFUNDED
 *                     payment's `amount`. Answers "was this order paid?".
 *   refunded        — money Razorpay gave back. Sum of every settled refund.
 *   net collected   — gross − refunded. Answers "how much do we still hold?",
 *                     and therefore "what is still owed?".
 *
 * Only `netCollected` may be subtracted from an order total. Using gross there is
 * the duplicate-collection bug: it tells the customer nothing is owed when money
 * has already been returned to them.
 */

/** The subset of a `Payment` row this module reads. */
export type RefundablePayment = {
  amount: number;
  status: string;
  /** `Payment.refundedAmount`. Absent on rows written before the migration. */
  refundedAmount?: number | null;
};

/** Lifecycle of a refund, mirroring Razorpay's own events. */
export type RefundPhase = "CREATED" | "PROCESSED" | "FAILED";

/** Why a refund event produced no writes. */
export type RefundAckReason =
  | "unknown-order"
  | "missing-refund-id"
  | "missing-amount"
  | "already-settled"
  | "already-failed"
  | "already-recorded"
  | "nothing-to-record";

/** The write set for one refund event. */
export type RefundAccountingPlan =
  | { kind: "REFUND_ACK"; reason: RefundAckReason }
  | {
      kind: "REFUND";
      refundId: string;
      /** Razorpay's `rfnd_…` — the unique key this plan upserts on. */
      amount: number;
      phase: RefundPhase;
      /** Local `Payment.id` to increment, or null when the capture is unknown. */
      paymentId: string | null;
      /**
       * Paise to ADD to `Payment.refundedAmount`. Zero for a redelivery or a
       * failed refund — the single most important number here, because adding it
       * twice is how a payment ends up "fully refunded" on half the money.
       */
      refundDelta: number;
      /** `Payment.refundedAmount` after applying this delta, clamped to amount. */
      refundTotalAfter: number;
      /** True when this refund leaves nothing retained on the payment. */
      fullyRefunded: boolean;
      /** Customer/admin-visible timeline note. */
      note: string;
    };

function paise(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/**
 * Money already returned on one payment, clamped to what was captured.
 *
 * Clamping matters: `refundedAmount` is derived from webhook payloads, and a
 * malformed one must not be able to make a payment look fully refunded or push a
 * negative net into the balance.
 */
export function refundedOnPayment(payment: RefundablePayment): number {
  return Math.min(paise(payment.refundedAmount ?? 0), paise(payment.amount));
}

/**
 * Money Razorpay took, in paise: every PAID and REFUNDED payment's `amount`.
 *
 * Identical to `settledAmount` in payment-status.ts by design. It is repeated
 * here rather than imported so this module stands alone, and the two are pinned
 * against each other by tests — a divergence between them is the exact class of
 * bug Batch 2 was written to end.
 */
export function grossCollectedAmount(
  payments: readonly RefundablePayment[],
): number {
  let total = 0;
  for (const payment of payments) {
    if (payment.status === "PAID" || payment.status === "REFUNDED") {
      total += paise(payment.amount);
    }
  }
  return total;
}

/** Money Razorpay gave back across every settled refund, in paise. */
export function refundedTotalAmount(
  payments: readonly RefundablePayment[],
): number {
  let total = 0;
  for (const payment of payments) {
    if (payment.status === "PAID" || payment.status === "REFUNDED") {
      total += refundedOnPayment(payment);
    }
  }
  return total;
}

/**
 * Money actually retained, in paise: gross minus refunds, floored at zero.
 *
 * This — never gross — is the figure that may be subtracted from an order total
 * to get a balance.
 */
export function netCollectedAmount(
  payments: readonly RefundablePayment[],
): number {
  return Math.max(
    0,
    grossCollectedAmount(payments) - refundedTotalAmount(payments),
  );
}

/**
 * What is still owed on an order, in paise. Never negative.
 *
 * Net-based. A gross-based balance under-reports whenever a refund has landed,
 * which is how an already-refunded customer gets asked to pay a second time.
 */
export function outstandingBalance(args: {
  total: number;
  payments: readonly RefundablePayment[];
}): number {
  return Math.max(0, paise(args.total) - netCollectedAmount(args.payments));
}

/**
 * Whether the order holds no money at all — every paise collected came back.
 *
 * This is the only condition that should put an order into REFUNDED. The
 * previous rule ("this one refund covered this one payment") marked a 100 000
 * order REFUNDED when a 50 000 partial capture was returned, which is both wrong
 * as accounting and wrong as behaviour: it closed the order while 50 000 was
 * legitimately still outstanding.
 *
 * Note this is deliberately NOT the same question as "is the outstanding balance
 * zero". An order can be net-zero and REFUNDED — we must not silently re-open it
 * and re-charge a customer we just refunded.
 */
export function isFullyRefunded(
  payments: readonly RefundablePayment[],
): boolean {
  const gross = grossCollectedAmount(payments);
  return gross > 0 && netCollectedAmount(payments) === 0;
}

/**
 * Whether this refund should close the ORDER as REFUNDED.
 *
 * `isFullyRefunded` alone is not enough, and getting this wrong strands a real
 * balance. It answers "does the order retain nothing?", which is true for two
 * completely different situations:
 *
 *   A. The order was paid in full (100 000) and all 100 000 came back. Nothing is
 *      owed and nothing ever will be — the order is finished.
 *   B. The order was only ever PARTIALLY captured (50 000 of 100 000) and that
 *      50 000 came back. Nothing is retained, so `isFullyRefunded` is true — but
 *      100 000 is still owed, because the un-captured remainder was never paid.
 *
 * Marking B REFUNDED closed the order while `outstandingBalance` still reported
 * the whole total, and pay-inline blocks REFUNDED orders outright. The balance
 * was then unreachable: not collectable by the customer, and not clearable by an
 * admin either, because `derivePaymentStatus` returns REFUNDED for a REFUNDED
 * order regardless of what has since been recorded.
 *
 * The discriminator is whether the order EVER held its full worth: gross
 * collected must have reached the order total. In A that holds, so the order
 * stays closed and we never re-charge a customer we just refunded. In B it does
 * not, so the order keeps whatever status it had and the balance stays payable.
 *
 * Deliberately NOT "is the outstanding balance zero" — that is the question this
 * function exists to stop conflating with it.
 */
export function shouldCloseOrderAfterRefund(args: {
  total: number;
  /** The order's payments as they stand once this refund is applied. */
  payments: readonly RefundablePayment[];
}): boolean {
  const gross = grossCollectedAmount(args.payments);
  const total = paise(args.total);
  // A fully-paid order that came back in full: closed, and stays closed.
  if (total > 0 && gross >= total) return isFullyRefunded(args.payments);
  // Never held its full worth, so a refund can only ever have returned part of
  // what was captured. Whatever is still outstanding stays payable.
  return false;
}

/** A payment row plus the identity needed to match it back to an order's rows. */
export type IdentifiedPayment = RefundablePayment & {
  razorpayPaymentId?: string | null;
};

/**
 * The order's payments as they will stand once this refund has been written.
 *
 * Pure projection rather than an inline map in the route: "has the order now
 * retained nothing?" is the question that decides REFUNDED, and it must be
 * answerable from a test without a database. The refunded payment is matched by
 * razorpayPaymentId — the id the webhook actually carries — so a synthetic or
 * manually recorded payment (no razorpay id) is left alone instead of being
 * corrupted by someone else's refund.
 */
export function applyRefundToPayments(
  payments: readonly IdentifiedPayment[],
  applied: {
    razorpayPaymentId: string;
    /** Status to put the payment into (REFUNDED when fully returned). */
    status: string;
    refundedAmount: number;
  },
): IdentifiedPayment[] {
  const rows: IdentifiedPayment[] = [];
  for (const payment of payments) {
    if (payment.razorpayPaymentId === applied.razorpayPaymentId) {
      rows.push({
        status: applied.status,
        amount: payment.amount,
        refundedAmount: Math.min(
          paise(applied.refundedAmount),
          paise(payment.amount),
        ),
        // Kept so the result can be projected again — two refunds landing on the
        // same order are applied in sequence, and the second call must still be
        // able to find its own payment.
        razorpayPaymentId: payment.razorpayPaymentId,
      });
    } else {
      rows.push({
        status: payment.status,
        amount: payment.amount,
        refundedAmount: payment.refundedAmount ?? null,
        razorpayPaymentId: payment.razorpayPaymentId,
      });
    }
  }
  return rows;
}

/**
 * Decide what to write for one refund event.
 *
 * `existing` is the `Refund` row already stored for this `rfnd_…`, read by the
 * route. It is the idempotency input: `razorpayRefundId` is unique, so a
 * redelivery resolves to a row that already exists and must contribute zero
 * additional paise.
 */
export function planRefundAccounting(args: {
  /** `rfnd_…`. Required — without it there is no idempotency key. */
  refundId: string | null;
  /** `refund.entity.amount` in paise. */
  refundAmount: number | null;
  /** Which Razorpay event this is. */
  phase: RefundPhase;
  /** Local `Payment` row for the refunded payment, if we have it. */
  payment: RefundablePayment & { id?: string } | null;
  /** The `Refund` row already stored for this refundId, if any. */
  existing: { status: string; amount: number } | null;
}): RefundAccountingPlan {
  const ack = (reason: RefundAckReason): RefundAccountingPlan => ({
    kind: "REFUND_ACK",
    reason,
  });

  if (!args.refundId) return ack("missing-refund-id");
  const amount = args.refundAmount === null ? 0 : paise(args.refundAmount);
  if (amount <= 0) return ack("missing-amount");

  const payment = args.payment;
  const alreadyRefunded = payment ? refundedOnPayment(payment) : 0;
  // Clamp to what was actually captured. Two refunds that together exceed the
  // capture cannot both be real, and the larger figure must not win.
  const ceiling = payment ? paise(payment.amount) : amount;

  // ── Idempotency, checked BEFORE any branch can write ─────────────────────
  //
  // A settled refund is final and the guard has to come first, not third. It
  // used to sit after the FAILED branch, so a delayed or replayed `refund.failed`
  // for a refund that had ALREADY been processed fell straight through to the
  // FAILED branch and returned a write plan — and the route upserts
  // `status: phase` unconditionally. The ledger then claimed a refund that
  // returned money had failed, which is the one claim an admin must never read
  // before deciding whether to re-issue it.
  //
  // Order matters, so it is written as an explicit state machine rather than
  // three scattered guards:
  //
  //   PROCESSED is terminal — no event may move it.
  //   FAILED    may be followed by a retry (CREATED/PROCESSED).
  //   CREATED   may be followed by settlement or failure.
  //   Same phase as stored → already handled, nothing to write. Without this a
  //   redelivered `refund.created` appended another timeline entry every time.
  const stored = args.existing?.status ?? null;
  if (stored === "PROCESSED") return ack("already-settled");
  if (stored === args.phase) {
    return ack(stored === "FAILED" ? "already-failed" : "already-recorded");
  }

  // `refund.failed` moves no money, ever. It is still recorded so the ledger
  // shows why the money never arrived, but refundedAmount is untouched and the
  // order is not marked refunded.
  if (args.phase === "FAILED") {
    return {
      kind: "REFUND",
      refundId: args.refundId,
      amount,
      phase: "FAILED",
      paymentId: payment?.id ?? null,
      refundDelta: 0,
      refundTotalAfter: alreadyRefunded,
      fullyRefunded: false,
      note:
        `Refund of ${formatINR(amount)} failed` +
        `${args.refundId ? ` (${args.refundId})` : ""}; no money was returned.`,
    };
  }

  if (args.phase === "CREATED") {
    // Initiation only. The money has not moved, so the payment's refunded total
    // is unchanged — but the row is written, so a later `refund.processed` for
    // the same id has a record to advance rather than a gap to guess at.
    return {
      kind: "REFUND",
      refundId: args.refundId,
      amount,
      phase: "CREATED",
      paymentId: payment?.id ?? null,
      refundDelta: 0,
      refundTotalAfter: alreadyRefunded,
      fullyRefunded: false,
      note:
        `Refund of ${formatINR(amount)} initiated` +
        `${args.refundId ? ` (${args.refundId})` : ""}; awaiting settlement.`,
    };
  }

  // phase === "PROCESSED"
  // With no Payment row there is nothing to increment and no captured amount to
  // measure against, so no figures are asserted at all: the refund is recorded
  // against the order (it really happened and the merchant really owes the money)
  // and left for reconciliation. Claiming a total or a delta here would be a
  // number with no column to write it to.
  const hasPayment = payment !== null;
  const refundTotalAfter = hasPayment
    ? Math.min(ceiling, alreadyRefunded + amount)
    : 0;
  const refundDelta = hasPayment ? refundTotalAfter - alreadyRefunded : 0;
  const fullyRefunded =
    hasPayment && refundTotalAfter >= ceiling && ceiling > 0;

  const note = fullyRefunded
    ? `Payment refunded in full: ${formatINR(refundTotalAfter)}${` (${args.refundId})`}`
    : `Partial refund of ${formatINR(amount)}: ${formatINR(
        refundTotalAfter,
      )} of ${formatINR(ceiling)} refunded in total${` (${args.refundId})`}.`;

  return {
    kind: "REFUND",
    refundId: args.refundId,
    amount,
    phase: "PROCESSED",
    paymentId: payment?.id ?? null,
    refundDelta,
    refundTotalAfter,
    fullyRefunded,
    note,
  };
}