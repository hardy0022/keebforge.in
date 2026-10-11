import "server-only";
import type { Prisma } from "@prisma/client";
import { Resend } from "resend";
import { prisma } from "@/lib/db/prisma";
import { settledAmount } from "@/lib/payments/payment-status";
import {
  planNotificationRecovery,
  planReconciliationTransition,
  queueMissingPaidConfirmations,
  reconcilePaidConfirmations,
  runPaidConfirmation,
  type EmailMessage,
  type NotificationRecoveryPlan,
  type NotificationReviewDecision,
  type PaidConfirmationDeps,
  type PaidConfirmationOrder,
  type PaidConfirmationResult,
  type ReconcileCandidate,
  type ReconciliationDeps,
  type ReconciliationReport,
  type ReconciliationTransition,
  type ScheduledReconcileReport,
  type SendOutcome,
} from "@/lib/notifications/paid-confirmation";
import {
  classifyResendApiError,
  resendErrorDiagnostic,
} from "@/lib/notifications/resend-diagnostics";
import {
  logSuppressedDelivery,
  resolveOutboundRecipient,
} from "@/lib/email/outbound";
import { readTemplateIds } from "@/lib/email/templates";

/**
 * Database + Resend adapter for the paid-order confirmation outbox.
 *
 * Called by both `/api/payments/verify` and `/api/payments/webhook` AFTER their
 * settlement transaction has committed. It is strictly best-effort: every
 * failure is captured in `OrderNotification` and logged, never thrown, and never
 * able to touch the payment state — by the time this runs the money is already
 * recorded, and a mail problem must not make a paid order look unpaid.
 */

const NOTIFICATION_TYPE = "PAID_CONFIRMATION" as const;

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  return apiKey ? new Resend(apiKey) : null;
}

export async function sendViaResend(message: EmailMessage): Promise<SendOutcome> {
  const resend = getResend();
  if (!resend) {
    // Unconfigured (e.g. local dev). Definitive — nothing was sent, so an
    // explicit retry after configuration is safe.
    return { kind: "rejected", reason: "resend:not-configured" };
  }
  // Test/suppression policy. A suppressed send is definitive (nothing left the
  // building), so it is recorded as a retryable rejection; an override rewrites
  // the recipient. Payment/order state is never touched either way.
  const plan = resolveOutboundRecipient(message.to);
  if (plan.action === "skip") {
    logSuppressedDelivery(plan.reason);
    return { kind: "rejected", reason: `suppressed:${plan.reason}` };
  }
  try {
    const from =
      process.env.EMAIL_FROM ?? "KeebForge <onboarding@resend.dev>";
    // A configured template is sent instead of the inline HTML; both carry the
    // same authoritative, already-decided data. The subject is passed either
    // way so the operator can still override it on the record.
    const { data, error } = message.template
      ? await resend.emails.send({
          from,
          to: plan.to,
          subject: message.subject,
          template: message.template,
        })
      : await resend.emails.send({
          from,
          to: plan.to,
          subject: message.subject,
          html: message.html,
        });
    if (error) {
      const reason = resendErrorDiagnostic(error);
      return classifyResendApiError(error) === "rejected"
        ? { kind: "rejected", reason }
        : { kind: "ambiguous", reason };
    }
    return { kind: "accepted", providerMessageId: data?.id ?? null };
  } catch (error) {
    // Timeout / socket / unknown — the message may already be in flight.
    return { kind: "ambiguous", reason: resendErrorDiagnostic(error) };
  }
}

async function loadOrder(
  orderId: string,
): Promise<PaidConfirmationOrder | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      services: true,
      shippingAddress: true,
      payments: { select: { amount: true, status: true } },
    },
  });
  if (!order) return null;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    type: order.type,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    paymentStatus: order.paymentStatus,
    total: order.total,
    // Gross collected from verified rows (PAID + REFUNDED): what was actually paid.
    paidAmount: settledAmount(order.payments),
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    services: order.services.map((service) => ({
      name: service.name,
      quantity: service.quantity,
      unitPrice: service.unitPrice,
      lineTotal: service.lineTotal,
    })),
    summary: (order.summary as Record<string, unknown> | null) ?? null,
    shippingMode: order.shippingMode,
    shippingAddress: order.shippingAddress
      ? {
          streetAddress: order.shippingAddress.streetAddress,
          city: order.shippingAddress.city,
          state: order.shippingAddress.state,
          postalCode: order.shippingAddress.postalCode,
        }
      : null,
  };
}

const deps: PaidConfirmationDeps = {
  claimPending: async (orderId) => {
    // `skipDuplicates` is ON CONFLICT DO NOTHING against the (orderId, type)
    // unique key: exactly one concurrent caller can create the row.
    await prisma.orderNotification.createMany({
      data: [{ orderId, type: NOTIFICATION_TYPE }],
      skipDuplicates: true,
    });
    const existing = await prisma.orderNotification.findUnique({
      where: { orderId_type: { orderId, type: NOTIFICATION_TYPE } },
      select: { id: true, status: true },
    });
    if (!existing) return { claimed: false, notificationId: null, status: null };

    // The claim. Postgres re-evaluates `status = 'PENDING'` under the row lock,
    // so only one of two racing requests moves it to IN_PROGRESS.
    const claimed = await prisma.orderNotification.updateMany({
      where: { id: existing.id, status: "PENDING" },
      data: {
        status: "IN_PROGRESS",
        claimedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
    if (claimed.count === 1) {
      return { claimed: true, notificationId: existing.id, status: "IN_PROGRESS" };
    }
    return { claimed: false, notificationId: existing.id, status: existing.status };
  },
  markSent: async (id, providerMessageId) => {
    await prisma.orderNotification.updateMany({
      where: { id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        providerMessageId,
        lastError: null,
      },
    });
  },
  markFailed: async (id, reason) => {
    await prisma.orderNotification.updateMany({
      where: { id },
      data: { status: "FAILED", lastError: reason },
    });
  },
  markNeedsReview: async (id, reason) => {
    await prisma.orderNotification.updateMany({
      where: { id },
      data: { status: "NEEDS_REVIEW", lastError: reason },
    });
  },
  send: sendViaResend,
};

/**
 * Attempt the paid-order confirmation for an order. Safe to call from any
 * settlement path: it no-ops unless the order is fully paid, and the atomic
 * claim makes concurrent verify/webhook calls send at most once.
 */
export async function notifyPaidOrder(
  orderId: string,
): Promise<PaidConfirmationResult> {
  try {
    const order = await loadOrder(orderId);
    if (!order) return { status: "skipped", reason: "order-not-found" };
    return await runPaidConfirmation(deps, order, readTemplateIds());
  } catch (error) {
    console.error(
      `[paid-confirmation] unexpected failure for order ${orderId}: ${resendErrorDiagnostic(error)}`,
    );
    return { status: "error", reason: resendErrorDiagnostic(error) };
  }
}

/**
 * Manual recovery for a CONFIRMED failure.
 *
 * Only `FAILED` may be re-queued: it is the state written for a definitive
 * Resend rejection (4xx) or an unconfigured provider, where the message is known
 * not to have been delivered. `NEEDS_REVIEW` and `IN_PROGRESS` are deliberately
 * NOT retryable here — their outcome is ambiguous and an automatic resend could
 * duplicate a message that was already accepted. Those require an operator to
 * reconcile against the Resend dashboard first.
 */
export async function retryFailedPaidConfirmation(
  orderId: string,
): Promise<PaidConfirmationResult> {
  const reset = await prisma.orderNotification.updateMany({
    where: { orderId, type: NOTIFICATION_TYPE, status: "FAILED" },
    data: { status: "PENDING", lastError: null },
  });
  if (reset.count === 0) {
    const existing = await prisma.orderNotification.findUnique({
      where: { orderId_type: { orderId, type: NOTIFICATION_TYPE } },
      select: { status: true },
    });
    return { status: "already-claimed", notificationStatus: existing?.status ?? null };
  }
  return notifyPaidOrder(orderId);
}

/**
 * How long an IN_PROGRESS claim may sit before it is treated as abandoned (a
 * crashed sender that never wrote a terminal state). Conservative: a live send
 * finishes in seconds, so 15 minutes means the process is gone.
 */
const AMBIGUOUS_STALE_AFTER_MS = 15 * 60 * 1000;

const RECOVERY_SELECT = {
  status: true,
  attempts: true,
  claimedAt: true,
  sentAt: true,
  providerMessageId: true,
  lastError: true,
  updatedAt: true,
} as const;

export type OrderNotificationInspection = {
  exists: boolean;
  plan: NotificationRecoveryPlan;
};

/** Read-only classification of an order's confirmation for the operator path. */
export async function inspectOrderNotification(
  orderId: string,
): Promise<OrderNotificationInspection> {
  const record = await prisma.orderNotification.findUnique({
    where: { orderId_type: { orderId, type: NOTIFICATION_TYPE } },
    select: RECOVERY_SELECT,
  });
  return {
    exists: record !== null,
    plan: planNotificationRecovery(record, {
      now: new Date(),
      staleAfterMs: AMBIGUOUS_STALE_AFTER_MS,
    }),
  };
}

/** A notification row shown on the admin notifications page. */
export type OrderNotificationAttention = {
  orderId: string;
  orderNumber: string;
  status: string;
  planKind: NotificationRecoveryPlan["kind"];
  attempts: number;
  lastError: string | null;
  updatedAt: string;
  claimedAt: string | null;
};

/**
 * List non-sent confirmations that may need operator attention: resets awaiting
 * an explicit send (PENDING), in-flight claims (fresh vs stale), definitive
 * failures (FAILED) and ambiguous outcomes (NEEDS_REVIEW). SENT rows are omitted
 * because there is nothing to do. Read-only; bounded by `limit`.
 */
export async function listOrderNotificationsNeedingAttention(
  limit = 100,
): Promise<OrderNotificationAttention[]> {
  const rows = await prisma.orderNotification.findMany({
    where: {
      type: NOTIFICATION_TYPE,
      status: { in: ["PENDING", "IN_PROGRESS", "FAILED", "NEEDS_REVIEW"] },
    },
    select: {
      orderId: true,
      ...RECOVERY_SELECT,
      order: { select: { orderNumber: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  const now = new Date();
  return rows.map((row) => ({
    orderId: row.orderId,
    orderNumber: row.order.orderNumber,
    status: row.status,
    planKind: planNotificationRecovery(row, {
      now,
      staleAfterMs: AMBIGUOUS_STALE_AFTER_MS,
    }).kind,
    attempts: row.attempts,
    lastError: row.lastError,
    updatedAt: row.updatedAt.toISOString(),
    claimedAt: row.claimedAt ? row.claimedAt.toISOString() : null,
  }));
}

/**
 * Operator reconciliation for an ambiguous notification (M3).
 *
 * Refuses every state that is not ambiguous, and refuses without an explicit
 * `confirm`. A `confirmed-accepted` decision records what Resend already
 * delivered without another send; `confirmed-not-accepted` resets to PENDING so
 * a later, explicit send may re-attempt. Never sends by itself.
 */
export async function reconcileOrderNotification(
  orderId: string,
  input: {
    decision: NotificationReviewDecision;
    confirm: boolean;
    providerMessageId?: string | null;
    staleAfterMs?: number;
  },
): Promise<ReconciliationTransition> {
  const record = await prisma.orderNotification.findUnique({
    where: { orderId_type: { orderId, type: NOTIFICATION_TYPE } },
    select: RECOVERY_SELECT,
  });
  const plan = planNotificationRecovery(record, {
    now: new Date(),
    staleAfterMs: input.staleAfterMs ?? AMBIGUOUS_STALE_AFTER_MS,
  });
  const transition = planReconciliationTransition(plan, input.decision, input.confirm);
  if (transition.action === "refuse") return transition;

  // Guarded on the ambiguous states only, so a race that moved the row into a
  // terminal state between the read and the write is a no-op.
  const ambiguousWhere: Prisma.OrderNotificationWhereInput = {
    orderId,
    type: NOTIFICATION_TYPE,
    status: { in: ["NEEDS_REVIEW", "IN_PROGRESS"] },
  };
  if (transition.action === "reset-to-pending") {
    await prisma.orderNotification.updateMany({
      where: ambiguousWhere,
      data: { status: "PENDING", lastError: null },
    });
  } else {
    await prisma.orderNotification.updateMany({
      where: ambiguousWhere,
      data: {
        status: "SENT",
        sentAt: new Date(),
        lastError: null,
        ...(input.providerMessageId
          ? { providerMessageId: input.providerMessageId }
          : {}),
      },
    });
  }
  return transition;
}

/**
 * Explicit resend for a reconciled order. Only a PENDING row can be sent, so an
 * ambiguous record must have been reconciled first and a delivered order can
 * never be re-sent by accident.
 */
export async function resendPaidConfirmation(
  orderId: string,
): Promise<PaidConfirmationResult> {
  const existing = await prisma.orderNotification.findUnique({
    where: { orderId_type: { orderId, type: NOTIFICATION_TYPE } },
    select: { status: true },
  });
  if (!existing) {
    return { status: "skipped", reason: "order-not-found" };
  }
  if (existing.status !== "PENDING") {
    return { status: "already-claimed", notificationStatus: existing.status };
  }
  return notifyPaidOrder(orderId);
}

const reconciliationDeps: ReconciliationDeps = {
  listMissing: async ({ orderIds, since, eligibleOnly, limit }) => {
    const rows = await prisma.order.findMany({
      where: {
        paymentStatus: "PAID",
        ...(since ? { createdAt: { gte: since } } : {}),
        ...(orderIds ? { id: { in: orderIds } } : {}),
        // The sendability gate's shape, pushed down so a bounded batch is never
        // filled with rows the pure gate would only skip. The gate still runs
        // afterwards and remains the authority.
        ...(eligibleOnly
          ? { type: { in: ["PRODUCT", "SERVICE"] }, customerEmail: { not: "" } }
          : {}),
        notifications: { none: { type: NOTIFICATION_TYPE } },
      },
      select: {
        id: true,
        orderNumber: true,
        type: true,
        paymentStatus: true,
        customerEmail: true,
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows as ReconcileCandidate[];
  },
  queue: async (orderId) => {
    const result = await prisma.orderNotification.createMany({
      data: [{ orderId, type: NOTIFICATION_TYPE }],
      skipDuplicates: true,
    });
    return result.count === 1 ? "created" : "exists";
  },
};

/**
 * Historical backfill (M1): find PAID orders with no confirmation row and, only
 * when an explicit selection is supplied, queue PENDING rows for them. Defaults
 * to a dry-run report and never sends.
 */
export async function reconcilePaidConfirmationsDb(input: {
  orderIds?: string[];
  dryRun?: boolean;
  limit?: number;
}): Promise<ReconciliationReport> {
  return reconcilePaidConfirmations(reconciliationDeps, input);
}

/**
 * Scheduled bounded backfill (Part A).
 *
 * Queues missing PENDING confirmation rows for fully paid PRODUCT/SERVICE orders
 * created on or after the validated cutoff. Queue only: it never sends, retries,
 * resets or otherwise mutates an existing notification, and never touches
 * payment/order state. The `queue` dependency is a `createMany … skipDuplicates`
 * create-only insert, so idempotency comes from the `(orderId, type)` unique
 * constraint rather than a read-then-write race.
 */
export async function queueMissingPaidConfirmationsDb(input: {
  since: Date;
  max?: number;
  batchSize?: number;
}): Promise<ScheduledReconcileReport> {
  return queueMissingPaidConfirmations(reconciliationDeps, input);
}
