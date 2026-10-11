"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Spinner } from "@/components/admin/ActionForm";
import {
  queuePaidNotifications,
  reportMissingPaidNotifications,
  resendOrderNotification,
  retryFailedOrderNotification,
  reviewOrderNotification,
  type NotificationReconcileState,
} from "@/app/admin/actions/notifications";
import type {
  NotificationRecoveryPlan,
  ReconciliationReport,
} from "@/lib/notifications/paid-confirmation";

export type AttentionItem = {
  orderId: string;
  orderNumber: string;
  status: string;
  planKind: NotificationRecoveryPlan["kind"];
  attempts: number;
  lastError: string | null;
  updatedAtLabel: string;
};

const KIND_META: Record<
  string,
  { label: string; badge: string; hint: string }
> = {
  pending: {
    label: "Awaiting send",
    badge: "badge-warn",
    hint: "Queued but not sent. Send it explicitly when you are ready.",
  },
  retryable: {
    label: "Failed (retryable)",
    badge: "badge-err",
    hint: "The provider definitively rejected this attempt. Retrying is safe.",
  },
  ambiguous: {
    label: "Needs review",
    badge: "badge-warn",
    hint: "The outcome is unknown. Check the Resend dashboard first; a resend is not automatic.",
  },
  "ambiguous-stale-in-flight": {
    label: "Stale in-progress",
    badge: "badge-warn",
    hint: "A sender claimed this and stopped. Reconcile before any resend.",
  },
  "in-flight": {
    label: "Sending",
    badge: "",
    hint: "A send is currently in progress. Leave it alone.",
  },
  "already-sent": { label: "Sent", badge: "badge-ok", hint: "" },
  "no-record": { label: "No record", badge: "", hint: "" },
};

function Feedback({ state, label }: { state: NotificationReconcileState; label: string }) {
  if (state.ok) {
    return <p className="kf-toast ok">✓ {state.message ?? label}</p>;
  }
  if (state.error) {
    return (
      <p role="alert" style={{ color: "var(--err)", fontSize: "0.78rem", margin: 0 }}>
        ✕ {state.error}
      </p>
    );
  }
  return null;
}

function BackfillPanel() {
  const [reportState, reportAction, reportPending] = useActionState(
    reportMissingPaidNotifications,
    {},
  );
  const [queueState, queueAction, queuePending] = useActionState(
    queuePaidNotifications,
    {},
  );

  const report: ReconciliationReport | undefined = reportState.report;
  const queueable =
    report?.rows.filter((row) => row.action === "would-queue") ?? [];
  const skipped =
    report?.rows.filter((row) => row.action === "skipped-ineligible") ?? [];

  return (
    <section
      className="admin-card"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div>
        <h2
          style={{
            fontFamily: "var(--ff-display)",
            fontSize: "1.05rem",
            fontWeight: 700,
          }}
        >
          Missing confirmations
        </h2>
        <p className="muted" style={{ fontSize: "0.8rem", marginTop: 4 }}>
          Find paid orders that never got a confirmation row — for example when
          the process stopped right after the payment committed — then queue the
          ones you choose. Queueing never sends an email; sending stays a
          separate, explicit step.
        </p>
      </div>

      <form action={reportAction}>
        <button className="btn-admin" disabled={reportPending}>
          {reportPending ? <Spinner /> : "Run dry-run report"}
        </button>
      </form>

      <Feedback state={reportState} label="Report ready." />

      {report && (
        <>
          {queueable.length === 0 ? (
            <p className="muted" style={{ fontSize: "0.8rem" }}>
              Nothing to queue.
            </p>
          ) : (
            <form
              action={queueAction}
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <div
                style={{
                  border: "1px solid var(--bdr)",
                  borderRadius: 8,
                  maxHeight: 260,
                  overflow: "auto",
                  padding: 6,
                }}
              >
                {queueable.map((row) => (
                  <label
                    key={row.orderId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 6px",
                      fontSize: "0.82rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      name="orderIds"
                      value={row.orderId}
                      defaultChecked
                    />
                    <span style={{ fontWeight: 600 }}>{row.orderNumber}</span>
                  </label>
                ))}
              </div>
              <button
                className="btn-admin primary"
                disabled={queuePending}
                style={{ alignSelf: "flex-start" }}
              >
                {queuePending ? <Spinner /> : "Queue selected (no email sent)"}
              </button>
            </form>
          )}

          {skipped.length > 0 && (
            <p className="muted" style={{ fontSize: "0.72rem" }}>
              {skipped.length} skipped — repairs/unsupported order types or a
              missing recipient never receive a confirmation.
            </p>
          )}

          <Feedback state={queueState} label="Queued." />
        </>
      )}
    </section>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const [reconcileState, reconcileAction, reconcilePending] = useActionState(
    reviewOrderNotification,
    {},
  );
  const [resendState, resendAction, resendPending] = useActionState(
    resendOrderNotification,
    {},
  );
  const [retryState, retryAction, retryPending] = useActionState(
    retryFailedOrderNotification,
    {},
  );

  const meta = KIND_META[item.planKind] ?? {
    label: item.planKind,
    badge: "",
    hint: "",
  };
  const ambiguous =
    item.planKind === "ambiguous" ||
    item.planKind === "ambiguous-stale-in-flight";

  return (
    <tr>
      <td style={{ whiteSpace: "nowrap" }}>
        <Link
          href={`/admin/orders/${item.orderNumber}`}
          style={{ color: "var(--acc)", fontWeight: 600 }}
        >
          {item.orderNumber}
        </Link>
        <div className="muted" style={{ fontSize: "0.68rem" }}>
          {item.updatedAtLabel}
        </div>
      </td>
      <td>
        <span
          className={`badge ${meta.badge}`}
          style={{ fontSize: "0.65rem", padding: "2px 8px" }}
        >
          {meta.label}
        </span>
        <div className="muted num" style={{ fontSize: "0.66rem" }}>
          attempts: {item.attempts}
        </div>
      </td>
      <td style={{ maxWidth: 220 }}>
        {meta.hint && (
          <div className="muted" style={{ fontSize: "0.72rem" }}>
            {meta.hint}
          </div>
        )}
        {item.lastError && (
          <div
            className="muted"
            style={{ fontSize: "0.66rem", fontFamily: "var(--ff-mono, monospace)" }}
          >
            {item.lastError}
          </div>
        )}
      </td>
      <td style={{ minWidth: 220 }}>
        {item.planKind === "pending" && (
          <form action={resendAction}>
            <input type="hidden" name="orderId" value={item.orderId} />
            <button className="btn-admin primary sm" disabled={resendPending}>
              {resendPending ? <Spinner /> : "Send confirmation"}
            </button>
          </form>
        )}

        {item.planKind === "retryable" && (
          <form action={retryAction}>
            <input type="hidden" name="orderId" value={item.orderId} />
            <button className="btn-admin sm" disabled={retryPending}>
              {retryPending ? <Spinner /> : "Retry delivery"}
            </button>
          </form>
        )}

        {ambiguous && (
          <form
            action={reconcileAction}
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <input type="hidden" name="orderId" value={item.orderId} />
            <select className="select" name="decision" defaultValue="" required>
              <option value="" disabled>
                Choose decision…
              </option>
              <option value="confirmed-accepted">
                Resend accepted it — mark delivered
              </option>
              <option value="confirmed-not-accepted">
                Resend rejected it — reset to pending
              </option>
            </select>
            <input
              className="input"
              name="providerMessageId"
              placeholder="Resend message id (optional)"
              autoComplete="off"
            />
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: "0.72rem",
              }}
            >
              <input type="checkbox" name="confirm" value="1" required />
              I checked the Resend dashboard
            </label>
            <button
              className="btn-admin sm"
              disabled={reconcilePending}
              style={{ alignSelf: "flex-start" }}
            >
              {reconcilePending ? <Spinner /> : "Reconcile"}
            </button>
          </form>
        )}

        {item.planKind === "in-flight" && (
          <span className="muted" style={{ fontSize: "0.75rem" }}>
            In progress…
          </span>
        )}

        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          <Feedback state={reconcileState} label="Reconciled." />
          <Feedback state={resendState} label="Sent." />
          <Feedback state={retryState} label="Retried." />
        </div>
      </td>
    </tr>
  );
}

export function NotificationsManager({ items }: { items: AttentionItem[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <BackfillPanel />

      {items.length === 0 ? (
        <div className="empty">
          <b>Nothing needs attention</b>
          Every paid order&apos;s confirmation is either sent or in flight.
        </div>
      ) : (
        <div className="admin-card" style={{ overflow: "auto" }}>
          <table className="admin-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>Detail</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <AttentionRow key={item.orderId} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
