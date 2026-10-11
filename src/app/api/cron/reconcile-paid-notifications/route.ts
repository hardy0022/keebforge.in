import { NextRequest, NextResponse } from "next/server";
import { runScheduledReconcile } from "@/lib/notifications/reconcile-cron";
import { queueMissingPaidConfirmationsDb } from "@/lib/notifications/send-paid-confirmation";
import {
  PREVIEW_OPERATION_DISABLED_MESSAGE,
  previewOperationsAllowed,
} from "@/lib/config/deployment";

export const dynamic = "force-dynamic";

/**
 * Scheduled, bounded reconciliation of missing paid-order notifications.
 *
 * Vercel Cron calls this once per day (03:00 UTC; see `vercel.json`) with
 * `Authorization: Bearer $CRON_SECRET`. The daily schedule is a Hobby-plan
 * constraint: Hobby allows only once-per-day crons, so reconciliation runs daily
 * rather than every 15 minutes. It creates missing PENDING confirmation rows for fully paid
 * orders created on or after `PAID_NOTIFICATION_RECONCILE_SINCE` and does
 * nothing else: it never sends an email, retries an existing row, resets a
 * state, or modifies payment/order state. Delivery stays an explicit operator
 * action.
 *
 * Fails closed: a missing/invalid secret or an unusable cutoff returns a safe
 * error without scanning or queueing anything. Neither the secret nor the
 * Authorization header is ever logged.
 *
 * All decision logic lives in `runScheduledReconcile`, which is injected with
 * the queue dependency here and exercised directly by the tests; this file is
 * only the HTTP binding.
 */
export async function GET(request: NextRequest) {
  // Defense in depth: queueing missing paid confirmations against a shared or
  // production database from a Preview deployment is refused before any scan.
  if (!previewOperationsAllowed()) {
    return NextResponse.json(
      { error: PREVIEW_OPERATION_DISABLED_MESSAGE },
      { status: 503 },
    );
  }

  const outcome = await runScheduledReconcile(
    request.headers.get("authorization"),
    {
      env: process.env,
      queueMissing: queueMissingPaidConfirmationsDb,
      log: (message) => console.log(message),
      error: (message) => console.error(message),
    },
  );
  return NextResponse.json(outcome.body, { status: outcome.status });
}
