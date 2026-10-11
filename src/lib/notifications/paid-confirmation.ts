import { formatINR } from "@/lib/utils/money";
import {
  esc,
  type EmailTemplateIds,
  type EmailTemplateRef,
} from "@/lib/email/templates";

// Re-exported so the existing call sites/tests keep one canonical escaper.
export { esc };

/**
 * Pure core for the paid-order confirmation email.
 *
 * Everything here is deterministic and dependency-free (like
 * `@/lib/payments/pay-inline-core`): the database and Resend arrive as injected
 * dependencies, so the delivery state machine, the content builders, and the
 * "at most one automatic send" contract can all be exercised without a database
 * or a network.
 *
 * The money rule: a confirmation is only ever built for an order whose
 * `paymentStatus` is PAID. The exact amount shown is passed in as
 * `paidAmount` — the caller derives it from the verified `Payment` rows, never
 * from the client.
 */

/** The `Order.type` values that receive a paid confirmation (PRODUCT = shop). */
export type PaidConfirmationType = "PRODUCT" | "SERVICE";

/** The order snapshot the builders render. All values are server-side snapshots. */
export type PaidConfirmationOrder = {
  id: string;
  orderNumber: string;
  type: string;
  customerName: string;
  customerEmail: string;
  /** Current `Order.paymentStatus`. Must be PAID to send. */
  paymentStatus: string;
  total: number;
  /** Gross collected from verified payment rows (paise). */
  paidAmount: number;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  services: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  summary: Record<string, unknown> | null;
  shippingMode: string | null;
  shippingAddress: {
    streetAddress: string;
    city: string;
    state: string;
    postalCode: string;
  } | null;
};

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  /**
   * When a Resend-managed template id is configured, the message is sent with
   * this instead of `html`. The payload stays authoritative in the application;
   * the template only renders the supplied variables.
   */
  template?: EmailTemplateRef;
};

/**
 * Result of asking the provider to accept a message.
 *
 *   accepted  — Resend returned an email id. The ONLY outcome that may be
 *               recorded as SENT.
 *   rejected  — a definitive 4xx rejection: not accepted, safe to retry.
 *   ambiguous — timeout/network/5xx: may or may not have been accepted. Must
 *               never be auto-retried.
 */
export type SendOutcome =
  | { kind: "accepted"; providerMessageId: string | null }
  | { kind: "rejected"; reason: string }
  | { kind: "ambiguous"; reason: string };

export type PaidConfirmationDeps = {
  /**
   * Atomically create-then-claim the single notification row for this order.
   * Exactly one concurrent caller may receive `{ claimed: true }`.
   */
  claimPending: (
    orderId: string,
  ) => Promise<{
    claimed: boolean;
    notificationId: string | null;
    status: string | null;
  }>;
  markSent: (
    notificationId: string,
    providerMessageId: string | null,
  ) => Promise<void>;
  markFailed: (notificationId: string, reason: string) => Promise<void>;
  markNeedsReview: (notificationId: string, reason: string) => Promise<void>;
  send: (message: EmailMessage) => Promise<SendOutcome>;
};

export type PaidConfirmationResult =
  | {
      status: "skipped";
      reason: "order-not-found" | "not-fully-paid" | "unsupported-order-type" | "no-recipient";
    }
  | { status: "already-claimed"; notificationStatus: string | null }
  | { status: "sent" }
  | { status: "failed"; reason: string }
  | { status: "needs-review"; reason: string }
  | { status: "error"; reason: string };

export type PaidConfirmationSkipReason =
  | "not-fully-paid"
  | "unsupported-order-type"
  | "no-recipient";

/**
 * The single sendability predicate, shared by the live send path and the
 * historical reconciliation report so the two can never disagree about which
 * orders should ever receive a confirmation.
 */
export function paidConfirmationSkipReason(
  order: Pick<PaidConfirmationOrder, "paymentStatus" | "type" | "customerEmail">,
): PaidConfirmationSkipReason | null {
  if (order.paymentStatus !== "PAID") return "not-fully-paid";
  if (order.type !== "PRODUCT" && order.type !== "SERVICE") {
    return "unsupported-order-type";
  }
  if (!order.customerEmail) return "no-recipient";
  return null;
}

/** Only a confirmed (definitive) failure is safe to re-queue automatically. */
export function isRetryableNotificationStatus(status: string): boolean {
  return status === "FAILED";
}

/**
 * Whether a manual-payment write should trigger a paid confirmation.
 *
 * A total-price edit recomputes `paymentStatus` but records no payment and must
 * never notify; only an actual payment row that fully settles the order may.
 */
export function shouldNotifyAfterManualPayment(input: {
  recordedAmount: number;
  paymentStatus: string;
}): boolean {
  return input.recordedAmount > 0 && input.paymentStatus === "PAID";
}

/**
 * Run one delivery attempt for a paid order.
 *
 * Never throws: a send or persistence failure is captured in the notification
 * row and returned. The caller must treat this as strictly best-effort — the
 * payment is already settled.
 */
export async function runPaidConfirmation(
  deps: PaidConfirmationDeps,
  order: PaidConfirmationOrder,
  templates: EmailTemplateIds = {},
): Promise<PaidConfirmationResult> {
  const skip = paidConfirmationSkipReason(order);
  if (skip) {
    return { status: "skipped", reason: skip };
  }

  const claim = await deps.claimPending(order.id);
  if (!claim.claimed || !claim.notificationId) {
    return { status: "already-claimed", notificationStatus: claim.status };
  }

  let outcome: SendOutcome;
  try {
    outcome = await deps.send(buildPaidConfirmation(order, templates));
  } catch {
    // A thrown send is ambiguous by definition: the request may have left the
    // process before it failed. Never retry it automatically.
    outcome = { kind: "ambiguous", reason: "resend:threw" };
  }

  if (outcome.kind === "accepted") {
    await deps
      .markSent(claim.notificationId, outcome.providerMessageId)
      .catch(() => {});
    return { status: "sent" };
  }
  if (outcome.kind === "rejected") {
    await deps.markFailed(claim.notificationId, outcome.reason).catch(() => {});
    return { status: "failed", reason: outcome.reason };
  }
  await deps
    .markNeedsReview(claim.notificationId, outcome.reason)
    .catch(() => {});
  return { status: "needs-review", reason: outcome.reason };
}

/** Pick the right builder for the order type. */
export function buildPaidConfirmation(
  order: PaidConfirmationOrder,
  templates: EmailTemplateIds = {},
): EmailMessage {
  return order.type === "SERVICE"
    ? buildModsPaidConfirmation(order, templates)
    : buildShopPaidConfirmation(order, templates);
}

export function buildShopPaidConfirmation(
  order: PaidConfirmationOrder,
  templates: EmailTemplateIds = {},
): EmailMessage {
  const amountPaid = order.paidAmount > 0 ? order.paidAmount : order.total;
  const rows: Array<[string, string]> = order.items.map((item) => [
    `${item.name} × ${item.quantity}`,
    formatINR(item.lineTotal),
  ]);
  return {
    to: order.customerEmail,
    subject: `Payment received — order ${order.orderNumber}`,
    html:
      `<h2>Payment received — KeebForge</h2>` +
      `<p>${greeting(order)}</p>` +
      `<p>We've received your payment for order <strong>${esc(order.orderNumber)}</strong>. ` +
      `This confirms your order is paid.</p>` +
      table(rows) +
      `<table cellpadding="6" style="font-family:sans-serif;font-size:14px">` +
      `<tr><td><strong>Amount paid</strong></td><td>${esc(formatINR(amountPaid))}</td></tr>` +
      `</table>` +
      `<p>Our team will contact you using the details you provided to coordinate the next steps.</p>`,
    template: templates.shopOrderPaid
      ? {
          id: templates.shopOrderPaid,
          variables: {
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            amountPaid: formatINR(amountPaid),
            itemsHtml: table(rows),
          },
        }
      : undefined,
  };
}

export function buildModsPaidConfirmation(
  order: PaidConfirmationOrder,
  templates: EmailTemplateIds = {},
): EmailMessage {
  const amountPaid = order.paidAmount > 0 ? order.paidAmount : order.total;
  const s = order.summary ?? {};

  const configRows: Array<[string, string]> = [];
  const device = joinNonEmpty([str(s.brand), str(s.model)]);
  if (device) configRows.push(["Device", device]);
  const layout = str(s.layout);
  if (layout) configRows.push(["Layout", layout]);
  const switchModel = str(s.switchModel);
  if (switchModel) configRows.push(["Switches", switchModel]);
  if (typeof s.switchQuantity === "number") {
    configRows.push(["Switch quantity", String(s.switchQuantity)]);
  }
  if (typeof s.stabilizerQuantity === "number") {
    configRows.push(["Stabilizers", String(s.stabilizerQuantity)]);
  }
  if (typeof s.keycapsIncluded === "boolean") {
    configRows.push(["Keycaps included", s.keycapsIncluded ? "Yes" : "No"]);
  }

  const serviceRows: Array<[string, string]> = order.services.map((service) => [
    `${service.name} × ${service.quantity}`,
    formatINR(service.lineTotal),
  ]);

  const method = modsShippingMethodLabel(
    asRecord(s.modsShipping)?.method,
    order.shippingMode,
  );
  const address = order.shippingAddress
    ? `${order.shippingAddress.streetAddress}, ${order.shippingAddress.city}, ` +
      `${order.shippingAddress.state} ${order.shippingAddress.postalCode}`
    : "";

  const configHtml = table(
    configRows.length > 0 ? configRows : [["Configuration", "Saved with your order"]],
  );
  const servicesHtml = table(
    serviceRows.length > 0 ? serviceRows : [["Services", "Saved with your order"]],
  );

  return {
    to: order.customerEmail,
    subject: `Payment received — mods order ${order.orderNumber}`,
    html:
      `<h2>Payment received — KeebForge mods</h2>` +
      `<p>${greeting(order)}</p>` +
      `<p>We've received your payment for mods order <strong>${esc(order.orderNumber)}</strong>. ` +
      `This confirms your order is paid.</p>` +
      `<h3>Your configuration</h3>` +
      configHtml +
      `<h3>Selected services</h3>` +
      servicesHtml +
      `<h3>Shipping</h3>` +
      table([
        ["Method", method],
        ["Shipping to", address || "To be confirmed"],
      ]) +
      `<table cellpadding="6" style="font-family:sans-serif;font-size:14px">` +
      `<tr><td><strong>Amount paid</strong></td><td>${esc(formatINR(amountPaid))}</td></tr>` +
      `</table>` +
      `<p>Our team will contact you before proceeding with your build.</p>`,
    template: templates.modsOrderPaid
      ? {
          id: templates.modsOrderPaid,
          variables: {
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            amountPaid: formatINR(amountPaid),
            configHtml,
            servicesHtml,
            shippingMethod: method,
            shippingAddress: address || "To be confirmed",
          },
        }
      : undefined,
  };
}

// ── Rendering helpers ───────────────────────────────────────────────────────

function greeting(order: PaidConfirmationOrder): string {
  const name = order.customerName.trim();
  return `Hi ${esc(name || "there")},`;
}

function table(rows: Array<[string, string]>): string {
  if (rows.length === 0) return "";
  return (
    `<table cellpadding="6" style="font-family:sans-serif;font-size:14px;color:#1a1a1a">` +
    rows
      .map(
        ([key, value]) =>
          `<tr><td><strong>${esc(key)}</strong></td><td>${esc(value)}</td></tr>`,
      )
      .join("") +
    `</table>`
  );
}

/**
 * Escape every value before it becomes HTML. All order content is either a
 * server snapshot or a customer-typed string, so nothing may be interpolated raw.
 *
 * Canonical definition lives in `@/lib/email/templates` and is re-exported above.
 */

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function joinNonEmpty(parts: string[]): string {
  return parts.filter((p) => p.length > 0).join(" ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function modsShippingMethodLabel(
  method: unknown,
  mode: string | null,
): string {
  const base =
    method === "customer_shipping"
      ? "You ship your device to KeebForge"
      : method === "pickup"
        ? "KeebForge arranges pickup"
        : method === "undecided"
          ? "To be decided"
          : "To be confirmed";
  const modeLabel =
    mode === "surface" ? " (Surface)" : mode === "express" ? " (Express)" : "";
  return base + modeLabel;
}

/* -------------------------------------------------------------------------- */
/* Notification recovery (M3) and historical reconciliation (M1)              */
/* -------------------------------------------------------------------------- */

/** The subset of a notification row the recovery planner needs. */
export type NotificationRecoveryRecord = {
  status: string;
  attempts: number;
  claimedAt: Date | null;
  sentAt: Date | null;
  providerMessageId: string | null;
  lastError: string | null;
  updatedAt: Date;
};

/**
 * Classification of a notification row's recoverability. Kept explicit so the
 * operator path and its tests reason about the same taxonomy:
 *
 * - `pending`                      — never attempted, or reset for an explicit resend.
 * - `already-sent`                 — terminal success; nothing to do.
 * - `retryable`                    — a definitive provider rejection (FAILED).
 * - `in-flight`                    — claimed recently; leave it alone.
 * - `ambiguous-stale-in-flight`    — claimed but abandoned; needs a human.
 * - `ambiguous`                    — NEEDS_REVIEW or an unknown status.
 */
export type NotificationRecoveryPlan =
  | { kind: "no-record" }
  | { kind: "pending" }
  | { kind: "already-sent"; providerMessageId: string | null }
  | { kind: "retryable"; reason: string | null }
  | { kind: "in-flight"; ageMs: number }
  | { kind: "ambiguous-stale-in-flight"; ageMs: number }
  | { kind: "ambiguous"; reason: string | null };

export function planNotificationRecovery(
  record: NotificationRecoveryRecord | null,
  opts: { now: Date; staleAfterMs: number },
): NotificationRecoveryPlan {
  if (!record) return { kind: "no-record" };

  switch (record.status) {
    case "PENDING":
      return { kind: "pending" };
    case "SENT":
      return { kind: "already-sent", providerMessageId: record.providerMessageId };
    case "FAILED":
      return { kind: "retryable", reason: record.lastError };
    case "NEEDS_REVIEW":
      return { kind: "ambiguous", reason: record.lastError };
    case "IN_PROGRESS": {
      const since = record.claimedAt ?? record.updatedAt;
      const ageMs = Math.max(0, opts.now.getTime() - since.getTime());
      return ageMs >= opts.staleAfterMs
        ? { kind: "ambiguous-stale-in-flight", ageMs }
        : { kind: "in-flight", ageMs };
    }
    default:
      return { kind: "ambiguous", reason: `unknown-status:${record.status}` };
  }
}

export type NotificationReviewDecision =
  | "confirmed-not-accepted"
  | "confirmed-accepted";

export type ReconciliationTransition =
  | { action: "reset-to-pending" }
  | { action: "mark-sent" }
  | { action: "refuse"; reason: string };

/**
 * Decide what an operator's reconciliation may do. Only an *ambiguous* record
 * (NEEDS_REVIEW, stale IN_PROGRESS, or unknown) can be reconciled, and only
 * with an explicit `confirm`. Defined failures use the definite retry path and
 * healthy states are left untouched, so this can never blindly reset/resend.
 */
export function planReconciliationTransition(
  plan: NotificationRecoveryPlan,
  decision: NotificationReviewDecision,
  confirm: boolean,
): ReconciliationTransition {
  if (!confirm) return { action: "refuse", reason: "confirmation-required" };
  const ambiguous =
    plan.kind === "ambiguous" || plan.kind === "ambiguous-stale-in-flight";
  if (!ambiguous) return { action: "refuse", reason: `not-ambiguous:${plan.kind}` };
  return decision === "confirmed-accepted"
    ? { action: "mark-sent" }
    : { action: "reset-to-pending" };
}

/** A PAID order that currently has no confirmation row (candidate to backfill). */
export type ReconcileCandidate = {
  id: string;
  orderNumber: string;
  type: string;
  paymentStatus: string;
  customerEmail: string;
};

export type ReconciliationDeps = {
  listMissing: (input: {
    orderIds: string[] | null;
    /**
     * When set, only orders created on or after this instant are considered.
     * Used by the scheduled backfill so the historical backlog is never
     * auto-queued; manual reconciliation leaves it null (explicit selection).
     */
    since: Date | null;
    /**
     * When true, the adapter may pre-filter at the database to the sendable
     * shape. The pure `paidConfirmationSkipReason` gate below remains the
     * authority; this is only a bounded-query optimisation.
     */
    eligibleOnly: boolean;
    limit: number;
  }) => Promise<ReconcileCandidate[]>;
  queue: (orderId: string) => Promise<"created" | "exists">;
};

export type ReconciliationRow = {
  orderId: string;
  orderNumber: string;
  action: "would-queue" | "queued" | "already-present" | "skipped-ineligible";
  reason?: string;
};

export type ReconciliationReport = {
  dryRun: boolean;
  examined: number;
  queued: number;
  alreadyPresent: number;
  skipped: number;
  rows: ReconciliationRow[];
};

/**
 * Backfill the crash window between a committed payment and its post-commit
 * notification row. This only ever *creates* missing PENDING rows; it never
 * sends. Applying is impossible without an explicit `orderIds` selection, so a
 * historical backlog can only be queued deliberately, order by order.
 */
export async function reconcilePaidConfirmations(
  deps: ReconciliationDeps,
  input: { orderIds?: string[]; dryRun?: boolean; limit?: number },
): Promise<ReconciliationReport> {
  const dryRun = input.dryRun !== false;
  const orderIds =
    input.orderIds && input.orderIds.length > 0 ? input.orderIds : null;

  if (!dryRun && !orderIds) {
    throw new Error(
      "reconcilePaidConfirmations: apply mode requires an explicit orderIds selection",
    );
  }

  const limit = input.limit ?? 500;
  const candidates = await deps.listMissing({
    orderIds,
    since: null,
    eligibleOnly: false,
    limit,
  });

  const rows: ReconciliationRow[] = [];
  let queued = 0;
  let alreadyPresent = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const skip = paidConfirmationSkipReason(candidate);
    if (skip) {
      skipped += 1;
      rows.push({
        orderId: candidate.id,
        orderNumber: candidate.orderNumber,
        action: "skipped-ineligible",
        reason: skip,
      });
      continue;
    }

    if (dryRun) {
      rows.push({
        orderId: candidate.id,
        orderNumber: candidate.orderNumber,
        action: "would-queue",
      });
      continue;
    }

    const result = await deps.queue(candidate.id);
    if (result === "created") {
      queued += 1;
      rows.push({
        orderId: candidate.id,
        orderNumber: candidate.orderNumber,
        action: "queued",
      });
    } else {
      alreadyPresent += 1;
      rows.push({
        orderId: candidate.id,
        orderNumber: candidate.orderNumber,
        action: "already-present",
      });
    }
  }

  return {
    dryRun,
    examined: candidates.length,
    queued,
    alreadyPresent,
    skipped,
    rows,
  };
}

/* -------------------------------------------------------------------------- */
/* Scheduled bounded backfill (Part A)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Hard ceiling on how many notification rows a single scheduled run may create,
 * regardless of any environment override. Keeps one cron invocation bounded.
 */
export const SCHEDULED_RECONCILE_HARD_MAX = 100;

/** Default page size for the bounded database batches. */
export const SCHEDULED_RECONCILE_DEFAULT_BATCH = 50;

export type ScheduledReconcileReport = {
  /** Rows actually created this run (never more than the effective cap). */
  queued: number;
  /** Candidates inspected, including any the sendability gate skipped. */
  scanned: number;
  /** Candidates that failed the shared sendability gate and were not queued. */
  skipped: number;
  /** Number of bounded database batches read. */
  batches: number;
  /**
   * True only when the effective per-run cap was reached *and* at least one
   * eligible candidate remains. A run that queues exactly `max` rows because the
   * backlog happened to end there is not "capped" — there is nothing left to do.
   */
  capped: boolean;
};

/**
 * Bounded automatic backfill of missing PENDING confirmation rows.
 *
 * This is the *only* automatic queueing path. It deliberately has no `send`
 * dependency: it can create missing PENDING rows and nothing else. It never
 * sends an email, never retries or resets an existing row, and never touches
 * payment/order state — delivery remains an explicit operator action.
 *
 * The cutoff (`since`) is mandatory, so the historical backlog can never be
 * auto-queued. Each database read is bounded, the loop advances because queued
 * rows drop out of the "missing" set, and an unproductive batch stops the loop
 * so an adapter that keeps returning the same candidates cannot spin.
 */
export async function queueMissingPaidConfirmations(
  deps: ReconciliationDeps,
  input: { since: Date; max?: number; batchSize?: number },
): Promise<ScheduledReconcileReport> {
  const requestedMax =
    input.max && input.max > 0 ? Math.floor(input.max) : SCHEDULED_RECONCILE_HARD_MAX;
  const max = Math.min(requestedMax, SCHEDULED_RECONCILE_HARD_MAX);
  const batchSize = Math.max(
    1,
    Math.min(
      input.batchSize && input.batchSize > 0
        ? Math.floor(input.batchSize)
        : SCHEDULED_RECONCILE_DEFAULT_BATCH,
      max,
    ),
  );

  let queued = 0;
  let scanned = 0;
  let skipped = 0;
  let batches = 0;
  let capped = false;

  while (queued < max) {
    const remaining = max - queued;
    const pageLimit = Math.min(batchSize, remaining);
    const candidates = await deps.listMissing({
      orderIds: null,
      since: input.since,
      eligibleOnly: true,
      limit: pageLimit,
    });
    batches += 1;
    if (candidates.length === 0) break;

    let createdThisBatch = 0;
    for (const candidate of candidates) {
      if (queued >= max) break;
      scanned += 1;
      const skip = paidConfirmationSkipReason(candidate);
      if (skip) {
        skipped += 1;
        continue;
      }
      const result = await deps.queue(candidate.id);
      if (result === "created") {
        queued += 1;
        createdThisBatch += 1;
      }
    }

    if (queued >= max) {
      // The cap stopped the loop, but that alone does not mean work remains: the
      // backlog may have ended exactly at the cap. One bounded probe decides it,
      // because the create-only queue has already removed everything just
      // queued from the "missing" set.
      const more = await deps.listMissing({
        orderIds: null,
        since: input.since,
        eligibleOnly: true,
        limit: 1,
      });
      capped = more.length > 0;
      break;
    }
    if (candidates.length < pageLimit) break;
    if (createdThisBatch === 0) break;
  }

  return { queued, scanned, skipped, batches, capped };
}
