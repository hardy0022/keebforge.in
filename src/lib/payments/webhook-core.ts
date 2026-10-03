import crypto from "crypto";
import type { OrderStatus } from "@prisma/client";
import { timingSafeEqualHex } from "@/lib/payments/razorpay-signature";
import {
  capturedAmount,
  derivePaymentStatus,
  orderStatusAfterCapture,
  type DerivedPaymentStatus,
} from "@/lib/payments/payment-status";
import type { RefundPhase } from "@/lib/payments/refund-accounting";

/**
 * Pure decision core for POST /api/payments/webhook.
 *
 * Extracted from the route so every routing and idempotency rule is exercised by
 * tests against real Razorpay payload shapes — no prisma, no network, no
 * environment. The route keeps only the plumbing: signature verification, the
 * database reads that build the snapshot, and the writes the plan selects.
 *
 * Two Razorpay facts drive the design, and the previous in-route version got
 * both of them wrong:
 *
 *  1. There is no `payment.refunded` event. Refunds arrive as `refund.created`
 *     / `refund.processed` / `refund.failed`, and their payload carries
 *     `payload.payment.entity` with `status: "captured"` plus `refund_status`
 *     and a cumulative `amount_refunded`. Routing refunds off the payment
 *     status alone therefore treats a refund as a fresh capture — and the
 *     `status === "refunded"` branch that used to exist was unreachable.
 *  2. `authorized` means `captured: false`. The money is not settled and
 *     Razorpay auto-refunds it after 3 days. Only `captured` is money in hand.
 */

/** What the endpoint should do with an event. */
export type RazorpayWebhookAction =
  | "CAPTURE"
  | "FAIL"
  | "REFUND_CREATED"
  | "REFUND_PROCESSED"
  | "REFUND_FAILED"
  | "ACK";

/** Result of routing one raw webhook body to an action. */
export type RazorpayWebhookClassification = {
  /** Raw Razorpay event name (`payment.captured`). "" when unparseable. */
  event: string;
  action: RazorpayWebhookAction;
  paymentId: string | null;
  razorpayOrderId: string | null;
  /** Payment amount in paise as reported by Razorpay, when present. */
  paymentAmount: number | null;
  method: string | null;
  customerId: string | null;
  failureReason: string | null;
  /** Refund id (`rfnd_…`) for REFUND actions. */
  refundId: string | null;
  /** Amount of THIS refund, in paise. */
  refundAmount: number | null;
  /** Cumulative amount refunded on the payment, in paise. */
  cumulativeRefunded: number | null;
};

/** Why an event produced no writes. Safe to log — carries no PII. */
export type WebhookAckReason =
  | "unparseable-payload"
  | "unhandled-event"
  | "unknown-order"
  | "already-captured"
  | "successful-payment-present"
  | "already-failed"
  | "already-refunded"
  | "refund-not-our-event";

/** Everything the planner needs to know about the order being paid. */
export type WebhookOrderSnapshot = {
  id: string;
  /** Order total in paise. */
  total: number;
  paymentStatus: string;
  /** Current `Order.status`, so a capture never drags a progressed order back. */
  status: OrderStatus;
  /** `razorpayCustomerId` carried on the order's billingDetails. */
  razorpayCustomerId: string | null;
  /** Whether any PAID payment row exists for this order. */
  hasPaidPayment: boolean;
  /** Money already settled on this order (PAID + REFUNDED), paise. */
  settledAmount: number;
};

/** The write set the route should execute. */
export type WebhookPlan =
  | { kind: "ACK"; reason: WebhookAckReason }
  | {
      kind: "CAPTURE";
      paymentId: string;
      razorpayOrderId: string | null;
      method: string;
      customerId: string | null;
      /** Money Razorpay charged for this attempt, paise. Not the order total. */
      amount: number;
      /** `Order.paymentStatus` to write, derived from the real settled sum. */
      paymentStatus: DerivedPaymentStatus;
      /** `Order.status` to write; unchanged unless this settles the order. */
      orderStatus: OrderStatus;
    }
  | {
      kind: "FAIL";
      paymentId: string;
      razorpayOrderId: string | null;
      failureReason: string;
      customerId: string | null;
      /** Amount this attempt tried to collect, paise. */
      amount: number;
      /**
       * Whether `order.paymentStatus` may be moved to FAILED. False whenever
       * the order already holds money — a later failure on a different attempt
       * must not erase a successful payment.
       */
      degradeOrder: boolean;
    }
| {
      kind: "REFUND";
      paymentId: string;
      razorpayOrderId: string | null;
      customerId: string | null;
      /** Refund id — the unique key the `Refund` row is stored under. */
      refundId: string | null;
      /** Which lifecycle event this is. */
      phase: RefundPhase;
      /** Amount of this refund, paise. */
      refundAmount: number | null;
      /** Cumulative amount refunded on the payment per Razorpay, paise. */
      cumulativeRefunded: number | null;
      /** Payment amount the refund is measured against, paise. */
      baseAmount: number;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Map a refund lifecycle phase to its action. */
function refundAction(phase: RefundPhase): RazorpayWebhookAction {
  return phase === "CREATED"
    ? "REFUND_CREATED"
    : phase === "FAILED"
      ? "REFUND_FAILED"
      : "REFUND_PROCESSED";
}

/** Inverse of {@link refundAction}. */
function refundPhaseOf(action: RazorpayWebhookAction): RefundPhase | null {
  return action === "REFUND_CREATED"
    ? "CREATED"
    : action === "REFUND_FAILED"
      ? "FAILED"
      : action === "REFUND_PROCESSED"
        ? "PROCESSED"
        : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Razorpay sends money as an integer; tolerate a numeric string either way. */
function asPaise(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : null;
}

const EMPTY: RazorpayWebhookClassification = {
  event: "",
  action: "ACK",
  paymentId: null,
  razorpayOrderId: null,
  paymentAmount: null,
  method: null,
  customerId: null,
  failureReason: null,
  refundId: null,
  refundAmount: null,
  cumulativeRefunded: null,
};

/**
 * Route a raw webhook body to an action.
 *
 * Never throws: a malformed body classifies as an ACK so the endpoint can
 * answer 200 and stop Razorpay retrying a payload it will never understand.
 *
 * Refunds are routed by EVENT NAME first, before the payment status is read at
 * all. That ordering is the whole point: a refund payload embeds a captured
 * payment entity, so any status-first routing re-records the capture and — for
 * a fully refunded order that has already been marked REFUNDED — flips it back
 * to PAID.
 */
export function classifyRazorpayWebhook(
  rawBody: string,
): RazorpayWebhookClassification {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return EMPTY;
  }
  const root = asRecord(parsed);
  if (!root) return EMPTY;

  const event = asString(root.event) ?? "";
  const payload = asRecord(root.payload);
  const payment = asRecord(asRecord(payload?.payment)?.entity);
  const refund = asRecord(asRecord(payload?.refund)?.entity);

  // A refund payload carries `payment.entity`, and the refund entity itself
  // carries the payment id, so either can identify the payment.
  const paymentId = asString(payment?.id) ?? asString(refund?.payment_id);
  const base: RazorpayWebhookClassification = {
    event,
    action: "ACK",
    paymentId,
    razorpayOrderId: asString(payment?.order_id),
    paymentAmount: asPaise(payment?.amount),
    method: asString(payment?.method),
    customerId: asString(payment?.customer_id),
    failureReason: asString(payment?.error_description),
    refundId: null,
    refundAmount: null,
    cumulativeRefunded: null,
  };
  if (!paymentId) return base;

  // ── Refund events ────────────────────────────────────────────────────────
  // All three lifecycle events are classified, because all three are facts about
  // the order's money:
  //
  //   refund.created   — initiated at Razorpay, money not yet returned.
  //   refund.processed — money returned. The ONLY one that moves figures.
  //   refund.failed    — never happened. Must be recorded so the ledger can show
  //                      the money is still held rather than silently unaccounted.
  //
  // `refund.speed_changed` is a settlement-speed note and stays an ACK, as does
  // any future refund.* event this code does not know about.
  const REFUND_PHASES: Record<string, RefundPhase> = {
    "refund.created": "CREATED",
    "refund.processed": "PROCESSED",
    "refund.failed": "FAILED",
  };
  const isRefundEvent = event.startsWith("refund.") || refund !== null;
  if (isRefundEvent) {
    const phase = REFUND_PHASES[event];
    if (!phase) return { ...base, action: "ACK" };
    const refundAmount = refund ? asPaise(refund.amount) : null;
    return {
      ...base,
      action: refundAction(phase),
      refundId: asString(refund?.id),
      refundAmount,
      // `amount_refunded` on the payment entity is CUMULATIVE across every
      // refund on that payment. It is recorded for diagnostics and never used as
      // a per-refund figure — see REFUND_PLAN_AMOUNT below.
      cumulativeRefunded: asPaise(payment?.amount_refunded) ?? refundAmount,
    };
  }

  // ── Payment events ───────────────────────────────────────────────────────
  // Anything else routes off the payment status. `authorized` deliberately
  // falls through to ACK: authorized money is not settled and Razorpay
  // auto-refunds it after 3 days, so it must never be recorded as PAID.
  const status = (asString(payment?.status) ?? "").toLowerCase();
  return {
    ...base,
    action:
      status === "captured" ? "CAPTURE" : status === "failed" ? "FAIL" : "ACK",
  };
}

/**
 * The configured webhook signing secret, or null when absent or blank.
 *
 * `RAZORPAY_WEBHOOK_SECRET=` present-but-empty is the single most damaging
 * misconfiguration here: the endpoint must not fall back to the API key secret
 * or to any locally generated value, because an HMAC computed with the wrong
 * secret fails every signature check and the webhook stops working silently
 * while Razorpay keeps reporting deliveries as successful-ish retries. Blank is
 * therefore treated exactly like unset, and the caller fails closed.
 */
export function readWebhookSecret(raw: string | undefined | null): string | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  return value === "" ? null : value;
}

/**
 * Constant-time HMAC-SHA256 check of a webhook signature over the RAW body.
 *
 * The body must be the exact bytes Razorpay signed — re-serializing the parsed
 * JSON changes key order/whitespace and breaks the digest.
 *
 * @returns true when the signature is present and matches.
 */
export function verifyWebhookSignature(
  rawBody: string,
  providedSignature: string | null | undefined,
  secret: string | null,
): boolean {
  if (!secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  // Shared with /verify so both Razorpay handshakes use one comparison; a
  // helper only one route calls is a helper the other drifts from.
  return timingSafeEqualHex(expected, providedSignature);
}

/**
 * Decide what to write for a classified event.
 *
 * Every guard here exists so a redelivered or out-of-order Razorpay event can
 * never corrupt an order that already holds money. Pure: all database facts
 * arrive as arguments.
 */
export function planWebhookAction(args: {
  classification: RazorpayWebhookClassification;
  order: WebhookOrderSnapshot | null;
  /** Status of the `Payment` row for this razorpayPaymentId, if it exists. */
  existingPaymentStatus: string | null;
}): WebhookPlan {
  const c = args.classification;
  const ack = (reason: WebhookAckReason): WebhookPlan => ({
    kind: "ACK",
    reason,
  });

  if (c.action === "ACK") return ack("unhandled-event");
  if (!c.paymentId) return ack("unparseable-payload");

  const order = args.order;
  // A webhook can race order creation. Ack even when the order is not found
  // yet: a non-2xx makes Razorpay retry until it times out.
  if (!order) return ack("unknown-order");

  // Money that has actually reached the account. NOT used to gate CAPTURE —
  // a partially paid order still owes its balance and must accept the capture —
  // only to stop FAILED and REFUND from walking payment state backwards.
  const holdsMoney =
    order.hasPaidPayment ||
    order.paymentStatus === "PAID" ||
    order.paymentStatus === "PARTIALLY_PAID" ||
    order.paymentStatus === "REFUNDED";

  // What this event is worth, not what the order happens to total. Pay-inline
  // opens one Razorpay order per attempt for the outstanding balance, so the
  // second capture on a partially-paid order covers the remainder, not the total.
  const amount = capturedAmount({
    total: order.total,
    settled: order.settledAmount,
    reported: c.paymentAmount,
  });

  if (c.action === "CAPTURE") {
    // Idempotency: the order-level PAID guard makes the transition run at most
    // once even when identical events arrive back to back, and an already-PAID
    // payment row for this id means we already recorded this exact capture.
    if (
      order.paymentStatus === "PAID" ||
      args.existingPaymentStatus === "PAID" ||
      order.paymentStatus === "REFUNDED"
    ) {
      return ack("already-captured");
    }
    const settledAfter = order.settledAmount + amount;
    const fullyPaid = order.total > 0 && settledAfter >= order.total;
    return {
      kind: "CAPTURE",
      paymentId: c.paymentId,
      razorpayOrderId: c.razorpayOrderId,
      method: c.method ?? "razorpay",
      customerId: c.customerId ?? order.razorpayCustomerId ?? null,
      amount,
      // Derived, never hardcoded to PAID: a capture that only covers part of the
      // order must leave it PARTIALLY_PAID so the balance stays payable.
      paymentStatus: derivePaymentStatus(settledAfter, order.total, order.paymentStatus),
      orderStatus: orderStatusAfterCapture(order.status, fullyPaid),
    };
  }

  if (c.action === "FAIL") {
    // Never overwrite a captured payment with a failure.
    if (args.existingPaymentStatus === "PAID") {
      return ack("successful-payment-present");
    }
    // Idempotency: Razorpay re-delivers any event it could not get a 2xx for.
    // Without this a single failed attempt appends the same timeline entry
    // once per retry.
    if (args.existingPaymentStatus === "FAILED") return ack("already-failed");
    return {
      kind: "FAIL",
      paymentId: c.paymentId,
      razorpayOrderId: c.razorpayOrderId,
      failureReason: c.failureReason ?? "Payment failed",
      customerId: c.customerId ?? order.razorpayCustomerId ?? null,
      amount,
      // A delayed or replayed failure for a LATER attempt must not downgrade an
      // order that already holds money — otherwise the outstanding balance is
      // re-inflated and the customer is asked to pay twice.
      degradeOrder: !holdsMoney,
    };
  }

  // ── Refunds ────────────────────────────────────────────────────────────
  // Every decision about HOW MUCH moved, whether the refund is partial or full,
  // and whether it has already been applied lives in
  // @/lib/payments/refund-accounting, which is unit-tested against real Razorpay
  // payload shapes. This only confirms the event is a refund at all and hands it
  // over.
  const phase = refundPhaseOf(c.action);
  if (!phase) return ack("refund-not-our-event");
  return {
    kind: "REFUND",
    paymentId: c.paymentId,
    razorpayOrderId: c.razorpayOrderId,
    customerId: c.customerId ?? order.razorpayCustomerId ?? null,
    refundId: c.refundId,
    phase,
    // REFUND_PLAN_AMOUNT. This is what this refund moved — never a cumulative
    // total, and never Razorpay's `payment.entity.amount_refunded`.
    //
    // That fallback used to be here, and it was wrong. `amount_refunded` is the
    // running total across every refund on the payment, so on the SECOND refund
    // of a payment the plan was handed 60 000 (30 000 + 30 000) and treated it
    // as this refund's own value: with 30 000 already returned, the payment was
    // written to 90 000 refunded. The ledger then claimed 900 paise came back
    // when 600 had.
    //
    // A refund whose own amount is absent cannot be applied safely, so it is not
    // applied at all — planRefundAccounting acknowledges it as `missing-amount`,
    // moves no money, and waits for a redelivery that carries the figure. The
    // per-refund `Refund` rows are the authoritative total; a cumulative field
    // must never be read as one refund's delta.
    refundAmount: c.refundAmount,
    cumulativeRefunded: c.cumulativeRefunded,
    baseAmount: c.paymentAmount ?? order.total,
  };
}

/**
 * Timeline note for a CAPTURE or FAIL plan. ACK plans have no note.
 *
 * Returns null for REFUND plans on purpose. The refund note carries the partial
 * /full distinction and the running refunded total, and those are computed in
 * @/lib/payments/refund-accounting from the order's real payment rows. Any note
 * produced from the plan alone would have to guess at those figures, which is the
 * bug this module stopped having. The route passes `accounting.note` instead.
 */
export function webhookTimelineNote(plan: WebhookPlan): string | null {
  if (plan.kind === "CAPTURE") {
    return `Payment captured via Razorpay (${plan.paymentId}).`;
  }
  if (plan.kind === "FAIL") {
    return `Payment failed: ${plan.failureReason}`;
  }
  return null;
}