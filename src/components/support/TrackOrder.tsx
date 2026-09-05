"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useState } from "react";
import type { OrderStatus } from "@prisma/client";
import { trackOrder, fetchShipmentScans, type TrackData, type TrackState, type ShipmentScanState } from "@/app/actions/track-order";
import { ORDER_PHASE_LABELS, orderPhaseFor } from "@/lib/track-phases";
import { formatINR } from "@/lib/money";
import { RazorpayScript } from "@/components/payments/RazorpayScript";
import { launchRazorpayPayment, type CreateOrderResponse } from "@/lib/razorpay-pay";

const SHIPMENT_LABELS: Record<string, string> = {
  NOT_DISPATCHED: "Not dispatched",
  DISPATCHED: "Dispatched",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  RETURNED: "Returned",
};

function humanize(v: string | null | undefined): string {
  if (!v) return "";
  return v.toLowerCase().replace(/_/g, " ");
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

export function TrackOrder({ initialOrder }: { initialOrder?: string }) {
  const [state, formAction, pending] = useActionState<TrackState, FormData>(trackOrder, { ok: false, error: "" });
  const [orderNumber, setOrderNumber] = useState(initialOrder ?? "");

  function reTrack(orderNumber: string) {
    const fd = new FormData();
    fd.set("orderNumber", orderNumber);
    startTransition(() => formAction(fd));
  }

  useEffect(() => {
    if (initialOrder) reTrack(initialOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="track-section">
      <div className="wrap">
        <div className="track-wrap">
          <RazorpayScript />
          <form action={formAction} className="track-form">
            <p className="track-card-title" id="track-order-label">
              Order Number
            </p>
            <p className="track-card-desc">Enter your order number to track your order.</p>
            <div className="track-row">
              <div className="track-field">
                <span className="track-field-prefix" aria-hidden="true">
                  #
                </span>
                <input
                  id="track-order-number"
                  name="orderNumber"
                  type="text"
                  className="input"
                  placeholder="e.g. KF30X2A"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  minLength={4}
                  maxLength={20}
                  disabled={pending}
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
                  aria-labelledby="track-order-label"
                  aria-describedby="track-hint"
                />
              </div>
              <button type="submit" className="btn-prime" disabled={pending}>
                {pending ? "Tracking…" : "Track Order"}
              </button>
            </div>
            <p id="track-hint" className="track-hint">
              Order numbers look like KF30X2A — yours is in your order confirmation email.
            </p>
          </form>

          {!state.ok && state.error && (
            <div role="alert" className="track-error">
              <p className="track-error-title">We couldn&apos;t find that order</p>
              <p className="track-error-body">{state.error}</p>
            </div>
          )}

          {state.ok && <TrackResult data={state.data} onPaid={() => reTrack(state.data.orderNumber)} />}
        </div>
      </div>
    </section>
  );
}

function PayNowInline({ orderNumber, total, onPaid }: { orderNumber: string; total: number; onPaid: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/payments/pay-inline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber }),
      });
      const data = (await res.json().catch(() => null)) as CreateOrderResponse | null;
      if (!res.ok || !data) {
        setError(data?.error ?? "Could not start payment.");
        setBusy(false);
        return;
      }
      launchRazorpayPayment({
        order: data,
        description: `Payment for order ${data.orderNumber}`,
        prefill: { name: data.customerName ?? "", email: data.customerEmail ?? "", contact: data.customerPhone ?? "" },
        onVerified: () => { setBusy(false); onPaid(); },
        onDismissed: () => setBusy(false),
        onError: (msg) => { setError(msg); setBusy(false); },
      });
    } catch {
      setError("Could not reach the payment server.");
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-prime btn-sm" onClick={() => void pay()} disabled={busy}>
        {busy ? "Opening payment…" : `Pay ${formatINR(total)} now`}
      </button>
      {error && <span className="track-pay-error-inline" role="alert">{error}</span>}
    </>
  );
}

function LiveTracking({ waybill }: { waybill: string }) {
  const [state, formAction, pending] = useActionState<ShipmentScanState, FormData>(fetchShipmentScans, { ok: false, error: "" });
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="track-detail">
        <dt>Live tracking</dt>
        <dd>
          <button type="button" className="track-timeline-btn" onClick={() => setOpen(true)}>
            View latest scans
          </button>
        </dd>
      </div>
    );
  }

  return (
    <div className="track-detail">
      <dt>Live tracking</dt>
      <dd>
        <form action={formAction} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="hidden" name="waybill" value={waybill} />
          <span className="font-mono text-xs">{waybill}</span>
          <button type="submit" className="track-timeline-btn" disabled={pending}>
            {pending ? "Fetching…" : state.ok ? "Refresh" : "Fetch scans"}
          </button>
        </form>
        {state.ok ? (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <p className="track-history-title">
              {state.status || "In transit"} {state.destination ? `· ${state.destination}` : ""}
            </p>
            <ol className="track-history-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {[...state.scans].reverse().map((sc, i) => (
                <li key={i} className="track-history-item">
                  <span className="track-history-dot" aria-hidden="true" />
                  <div className="track-history-body">
                    <p className="track-history-title">
                      {sc.status || "Scan"} {sc.location ? ` · ${sc.location}` : ""}
                    </p>
                    {sc.instructions && <p className="track-history-note">{sc.instructions}</p>}
                    {sc.scannedAt && <p className="track-history-date">{fmtDateTime(sc.scannedAt)}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : state.error ? (
          <p className="track-history-note" role="alert" style={{ marginTop: 8 }}>
            {state.error}
          </p>
        ) : null}
      </dd>
    </div>
  );
}

function TrackResult({ data, onPaid }: { data: TrackData; onPaid: () => void }) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const phase = orderPhaseFor(data.status as OrderStatus);
  const shipment = data.shipment;
  const firstRepair = data.repairs[0];
  const hasLines = data.items.length > 0 || data.services.length > 0;
  const hasShipment = !!(shipment && (shipment.courier || shipment.trackingNumber || shipment.trackingUrl || shipment.status || shipment.estimatedDeliveryDate));
  const paid = data.paymentStatus === "PAID";
  const amountNotSet = data.total <= 0;
  const canPay = !paid && !amountNotSet;

  useEffect(() => {
    if (!timelineOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTimelineOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [timelineOpen]);

  const stageDate = (stageIndex: number): string => {
    let date = "";
    for (const t of data.timeline) {
      if (orderPhaseFor(t.status as OrderStatus).index === stageIndex && t.createdAt && !date) date = t.createdAt;
    }
    return date ? fmtDate(date) : "";
  };

  return (
    <div className="track-results" aria-live="polite">
      <div className="track-section-head">
        <span className="os-section-title">Order Status</span>
        <span className="os-section-rule" aria-hidden="true" />
      </div>

      {/* Main status panel */}
      <div className="track-card track-status-card">
        <div className="track-head">
          <div>
            <p className="track-label">Order</p>
            <p className="track-number">{data.orderNumber}</p>
          </div>
          <div className="track-badges">
            {paid ? (
              <span className="badge badge-ok">Paid ✓</span>
            ) : amountNotSet ? (
              <span className="badge badge-warn">Payment Pending</span>
            ) : (
              <PayNowInline orderNumber={data.orderNumber} total={data.total} onPaid={onPaid} />
            )}
          </div>
        </div>

        <div className="track-progress">
          <p className="track-module-label">Order Progress</p>
          <div className="track-steps">
            {ORDER_PHASE_LABELS.map((label, i) => (
              <div
                key={label}
                className={`track-step${i < phase.index ? " is-done" : i === phase.index ? " is-current" : ""}`}
              >
                <span className="track-step-dot" aria-hidden="true" />
                <div className="track-step-body">
                  <span className="track-step-num" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="track-step-label">{label}</span>
                  {stageDate(i) && <span className="track-step-date">{stageDate(i)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="track-foot">
          <span>{data.updatedAt ? `Last updated ${fmtDate(data.updatedAt)}` : "Last updated —"}</span>
          {data.timeline.length > 0 && (
            <button
              type="button"
              className="track-timeline-btn"
              onClick={() => setTimelineOpen((o) => !o)}
              aria-expanded={timelineOpen}
              aria-controls="track-history"
            >
              Timeline
              <span className="track-timeline-chevron" aria-hidden="true">
                ▾
              </span>
            </button>
          )}
        </div>

        {timelineOpen && (
          <div className="track-history" id="track-history">
            <p className="track-history-label">Order History</p>
            <ol className="track-history-list">
              {[...data.timeline].reverse().map((u, i) => (
                <li key={`${u.createdAt}-${i}`} className="track-history-item">
                  <span className="track-history-dot" aria-hidden="true" />
                  <div className="track-history-body">
                    <p className="track-history-title">{u.label}</p>
                    {u.note && <p className="track-history-note">{u.note}</p>}
                    {u.createdAt && <p className="track-history-date">{fmtDateTime(u.createdAt)}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {hasLines && (
        <>
          <div className="track-section-head">
            <span className="os-section-title">Order Items</span>
            <span className="os-section-rule" aria-hidden="true" />
          </div>
          <div className="track-card track-items-card">
            {data.services.map((s, i) => (
              <div key={`srv-${i}`} className="track-item-row">
                <span className="track-item-thumb" aria-hidden="true">🛠</span>
                <div className="track-item-main">
                  <p className="track-item-name">{s.name}</p>
                  <p className="track-item-meta">
                    {s.quantity > 1 ? `Qty ${s.quantity}` : ""}
                  </p>
                </div>
                <span className="track-item-total">{formatINR(s.lineTotal)}</span>
              </div>
            ))}
            {data.items.map((it, i) => (
              <div key={`item-${i}`} className="track-item-row">
                <span className="track-item-thumb" aria-hidden="true">⌨</span>
                <div className="track-item-main">
                  <p className="track-item-name">{it.name}</p>
                  <p className="track-item-meta">
                    {it.quantity > 1 ? `Qty ${it.quantity}` : ""}
                  </p>
                </div>
                <span className="track-item-total">{formatINR(it.lineTotal)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {(firstRepair || hasShipment) && (
        <dl className="track-details">
          {firstRepair && (
            <>
              <div className="track-detail">
                <dt>Device</dt>
                <dd>
                  <b>{firstRepair.deviceModel ? `${humanize(firstRepair.deviceType)} — ${firstRepair.deviceModel}` : firstRepair.deviceModel || humanize(firstRepair.deviceType)}</b>
                </dd>
              </div>
              <div className="track-detail">
                <dt>Description</dt>
                <dd>{firstRepair.issue}</dd>
              </div>
            </>
          )}

          {hasShipment && (
            <>
              {shipment!.courier && (
                <div className="track-detail">
                  <dt>Courier</dt>
                  <dd>{shipment!.courier}</dd>
                </div>
              )}
              {shipment!.status && (
                <div className="track-detail">
                  <dt>Shipment</dt>
                  <dd>{SHIPMENT_LABELS[shipment!.status] ?? humanize(shipment!.status)}</dd>
                </div>
              )}
              {(shipment!.trackingNumber || shipment!.trackingUrl) && (
                <div className="track-detail">
                  <dt>Tracking</dt>
                  <dd>
                    {shipment!.trackingNumber && <span className="font-mono text-xs">{shipment!.trackingNumber}</span>}
                    {shipment!.trackingNumber && shipment!.trackingUrl && " · "}
                    {shipment!.trackingUrl && (
                      <Link href={shipment!.trackingUrl} target="_blank" rel="noopener noreferrer">
                        open courier ↗
                      </Link>
                    )}
                  </dd>
                </div>
              )}
              {shipment!.estimatedDeliveryDate && (
                <div className="track-detail">
                  <dt>Est. delivery</dt>
                  <dd>{fmtDate(shipment!.estimatedDeliveryDate)}</dd>
                </div>
              )}
              {shipment!.trackingNumber && <LiveTracking waybill={shipment!.trackingNumber} />}
            </>
          )}
        </dl>
      )}
    </div>
  );
}
