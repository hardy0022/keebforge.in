"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/admin";
import type { ActionState } from "@/components/admin/ActionForm";
import type {
  NotificationReviewDecision,
  ReconciliationReport,
} from "@/lib/notifications/paid-confirmation";
import {
  inspectOrderNotification,
  reconcileOrderNotification,
  reconcilePaidConfirmationsDb,
  resendPaidConfirmation,
  retryFailedPaidConfirmation,
} from "@/lib/notifications/send-paid-confirmation";

const NOTIFICATIONS_PATH = "/admin/notifications";

/**
 * Operator-facing reconciliation for paid-order confirmations.
 *
 * These actions exist because the automatic send path is deliberately
 * conservative: it never re-sends an ambiguous outcome. When an operator has
 * checked the Resend dashboard they can reconcile a stuck record here, or
 * backfill orders whose confirmation row was never written. Nothing in this file
 * sends an email as a side effect of reconciliation — a resend is always a
 * separate, explicit action, and history is queued only by explicit selection.
 *
 * Gated to `order:update`, matching `recordManualPayment`: this path does not
 * move money, so it does not need the stricter refund-level permission.
 */

export type NotificationReconcileState = ActionState & {
  report?: ReconciliationReport;
};

/** Report batch cap — keeps a dry run cheap and bounded. */
const REPORT_LIMIT_DEFAULT = 200;
const REPORT_LIMIT_MAX = 500;

/** Read-only dry-run: list PAID orders with no confirmation row. Never queues. */
export async function reportMissingPaidNotifications(
  _prev: NotificationReconcileState,
  formData: FormData,
): Promise<NotificationReconcileState> {
  await requirePermission("order", "update");
  const rawLimit = Number(String(formData.get("limit") ?? ""));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), REPORT_LIMIT_MAX)
      : REPORT_LIMIT_DEFAULT;
  try {
    const report = await reconcilePaidConfirmationsDb({ dryRun: true, limit });
    const toQueue = report.rows.filter((row) => row.action === "would-queue").length;
    return {
      ok: true,
      message: `${report.examined} order(s) without a confirmation — ${toQueue} would be queued.`,
      report,
    };
  } catch (e) {
    console.error("reportMissingPaidNotifications failed:", e);
    return { error: "Couldn't build the reconciliation report." };
  }
}

/**
 * Queue PENDING confirmations for an explicit selection of orders. Never sends,
 * and refuses an empty selection so a backlog can't be queued by accident.
 * Accepts checkbox `orderIds` entries and/or a comma-/whitespace-separated
 * `orderIdsText` field.
 */
export async function queuePaidNotifications(
  _prev: NotificationReconcileState,
  formData: FormData,
): Promise<NotificationReconcileState> {
  await requirePermission("order", "update");
  const parts = [
    ...formData.getAll("orderIds").map((v) => String(v)),
    String(formData.get("orderIdsText") ?? ""),
  ];
  const orderIds = parts
    .join(",")
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
  if (orderIds.length === 0) {
    return { error: "Select at least one order — historical emails are never queued in bulk." };
  }
  try {
    const report = await reconcilePaidConfirmationsDb({
      dryRun: false,
      orderIds,
      limit: orderIds.length,
    });
    for (const row of report.rows) {
      if (row.action === "queued") revalidatePath(`/admin/orders/${row.orderNumber}`);
    }
    revalidatePath(NOTIFICATIONS_PATH);
    return {
      ok: true,
      message: `Queued ${report.queued}, already present ${report.alreadyPresent}, skipped ${report.skipped}. No emails sent.`,
      report,
    };
  } catch (e) {
    console.error("queuePaidNotifications failed:", e);
    return { error: "Couldn't queue notifications." };
  }
}

/**
 * Reconcile one ambiguous notification after checking the Resend dashboard.
 *
 * `confirmed-accepted` records what Resend already delivered (no resend);
 * `confirmed-not-accepted` resets to PENDING so an explicit resend can follow.
 * The library refuses any non-ambiguous state and any request without `confirm`.
 */
export async function reviewOrderNotification(
  _prev: NotificationReconcileState,
  formData: FormData,
): Promise<NotificationReconcileState> {
  await requirePermission("order", "update");
  const orderId = String(formData.get("orderId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "");
  const confirm = ["1", "true", "on", "yes"].includes(
    String(formData.get("confirm") ?? "").toLowerCase(),
  );
  if (!orderId) return { error: "Order required." };
  if (decision !== "confirmed-not-accepted" && decision !== "confirmed-accepted") {
    return { error: "A reconciliation decision is required." };
  }
  try {
    const transition = await reconcileOrderNotification(orderId, {
      decision: decision as NotificationReviewDecision,
      confirm,
      providerMessageId: String(formData.get("providerMessageId") ?? "").trim() || null,
    });
    if (transition.action === "refuse") {
      return { error: `Refused: ${transition.reason}.` };
    }
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath(NOTIFICATIONS_PATH);
    return {
      ok: true,
      message:
        transition.action === "mark-sent"
          ? "Recorded as delivered. No email was sent."
          : "Reset to pending — send explicitly to resend.",
    };
  } catch (e) {
    console.error("reviewOrderNotification failed:", e);
    return { error: "Couldn't reconcile the notification." };
  }
}

/** Explicit resend for a reconciled (PENDING) confirmation. */
export async function resendOrderNotification(
  _prev: NotificationReconcileState,
  formData: FormData,
): Promise<NotificationReconcileState> {
  await requirePermission("order", "update");
  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) return { error: "Order required." };
  try {
    const inspection = await inspectOrderNotification(orderId);
    if (!inspection.exists) return { error: "No confirmation record for this order." };
    if (inspection.plan.kind !== "pending") {
      return {
        error: `A resend is only allowed after a record is reset to pending (currently ${inspection.plan.kind}).`,
      };
    }
    const outcome = await resendPaidConfirmation(orderId);
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath(NOTIFICATIONS_PATH);
    return { ok: true, message: `Resend result: ${outcome.status}.` };
  } catch (e) {
    console.error("resendOrderNotification failed:", e);
    return { error: "Couldn't resend the notification." };
  }
}

/**
 * Retry a CONFIRMED failure only. Delegates to retryFailedPaidConfirmation,
 * which resets FAILED → PENDING and re-sends; every other state is refused, so
 * an ambiguous outcome can never be retried through this control.
 */
export async function retryFailedOrderNotification(
  _prev: NotificationReconcileState,
  formData: FormData,
): Promise<NotificationReconcileState> {
  await requirePermission("order", "update");
  const orderId = String(formData.get("orderId") ?? "").trim();
  if (!orderId) return { error: "Order required." };
  try {
    const outcome = await retryFailedPaidConfirmation(orderId);
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath(NOTIFICATIONS_PATH);
    return { ok: true, message: `Retry result: ${outcome.status}.` };
  } catch (e) {
    console.error("retryFailedOrderNotification failed:", e);
    return { error: "Couldn't retry the notification." };
  }
}
