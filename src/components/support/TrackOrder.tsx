"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useState } from "react";
import type { OrderStatus } from "@prisma/client";
import {
  trackOrder,
  fetchShipmentScans,
  type TrackData,
  type TrackState,
  type ShipmentScanState,
} from "@/app/actions/track-order";
import {
  ORDER_PHASE_LABELS,
  orderPhaseFor,
  delhiveryStatusLabel,
} from "@/lib/shipping/track-phases";
import { formatINR } from "@/lib/utils/money";
import { RazorpayScript } from "@/components/payments/RazorpayScript";
import {
  launchRazorpayPayment,
  type CreateOrderResponse,
} from "@/lib/payments/razorpay-pay";

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
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

function fmtTime(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TrackOrder({ initialOrder }: { initialOrder?: string }) {
  const [state, formAction, pending] = useActionState<TrackState, FormData>(
    trackOrder,
    { ok: false, error: "" },
  );
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

          <form action={formAction} className="track-search">
            <div>
              <label
                htmlFor="track-order-number"
                className="track-search-label"
              >
                Order number
              </label>
              <p className="track-search-desc">
                Enter your order number to track your order.
              </p>
            </div>
            <div className="track-search-row">
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
              />
              <button type="submit" className="btn-track" disabled={pending}>
                {pending ? "Tracking…" : "Track Order"}
              </button>
            </div>
            <p className="track-search-hint">
              Order numbers look like <b>KF30X2A</b> — yours is in your order
              confirmation email.
            </p>
          </form>

          {!state.ok && state.error && (
            <div role="alert" className="track-error">
              <p className="track-error-title">
                We couldn&apos;t find that order
              </p>
              <p className="track-error-body">{state.error}</p>
            </div>
          )}

          {state.ok && (
            <TrackResult
              data={state.data}
              onPaid={() => reTrack(state.data.orderNumber)}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function PayNowInline({
  orderNumber,
  total,
  onPaid,
}: {
  orderNumber: string;
  total: number;
  onPaid: () => void;
}) {
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
      const data = (await res
        .json()
        .catch(() => null)) as CreateOrderResponse | null;
      if (!res.ok || !data) {
        setError(data?.error ?? "Could not start payment.");
        setBusy(false);
        return;
      }
      launchRazorpayPayment({
        order: data,
        description: `Payment for order ${data.orderNumber}`,
        prefill: {
          name: data.customerName ?? "",
          email: data.customerEmail ?? "",
          contact: data.customerPhone ?? "",
        },
        onVerified: () => {
          setBusy(false);
          onPaid();
        },
        onDismissed: () => setBusy(false),
        onError: (msg) => {
          setError(msg);
          setBusy(false);
        },
      });
    } catch {
      setError("Could not reach the payment server.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-prime btn-sm"
        onClick={() => void pay()}
        disabled={busy}
      >
        {busy ? "Opening payment…" : `Pay ${formatINR(total)} now`}
      </button>
      {error && (
        <span className="track-pay-error-inline" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

function LiveTracking({ waybill }: { waybill: string }) {
  const [state, formAction, pending] = useActionState<
    ShipmentScanState,
    FormData
  >(fetchShipmentScans, { ok: false, error: "" });
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!open) return;
    const fd = new FormData();
    fd.set("waybill", waybill);
    startTransition(() => formAction(fd));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, waybill]);

  return (
    <div className="track-live">
      <div className="track-live-head">
        <span className="track-live-label">Live tracking</span>
        {open ? (
          <form action={formAction} style={{ display: "contents" }}>
            <input type="hidden" name="waybill" value={waybill} />
            <button type="submit" className="track-live-btn" disabled={pending}>
              {pending ? "Fetching…" : state.ok ? "Refresh" : "Fetch scans"}
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="track-live-btn"
            onClick={() => setOpen(true)}
          >
            View latest scans
          </button>
        )}
      </div>

      {open && state.ok && (
        <div className="track-live-body">
          <p className="track-live-status">
            <span className="track-live-dot" aria-hidden="true" />
            {delhiveryStatusLabel(state.status) || "In Transit"}
          </p>
          <p className="track-live-tracking">
            Tracking: <span className="font-mono">{waybill}</span>
            {state.destination ? ` · ${state.destination}` : ""}
          </p>
          <ol className="track-history-list">
            {[...state.scans].reverse().map((sc, i) => (
              <li key={i} className="track-history-item">
                <span className="track-history-dot" aria-hidden="true" />
                <div className="track-history-body">
                  <p className="track-history-title">
                    {sc.status || "Scan"}
                    {sc.location ? ` · ${sc.location}` : ""}
                  </p>
                  {sc.instructions && (
                    <p className="track-history-note">{sc.instructions}</p>
                  )}
                  {sc.scannedAt && (
                    <p className="track-history-date">
                      {fmtDateTime(sc.scannedAt)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {open && !state.ok && state.error && (
        <p className="track-history-note" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}

function TrackResult({
  data,
  onPaid,
}: {
  data: TrackData;
  onPaid: () => void;
}) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const phase = orderPhaseFor(data.status as OrderStatus);
  const shipment = data.shipment;
  const firstRepair = data.repairs[0];
  const hasLines = data.items.length > 0 || data.services.length > 0;
  const hasShipment = !!(
    shipment &&
    (shipment.courier ||
      shipment.trackingNumber ||
      shipment.trackingUrl ||
      shipment.status ||
      shipment.estimatedDeliveryDate)
  );
  const paid = data.paymentStatus === "PAID";
  const amountNotSet = data.total <= 0;
  const messages = data.messages ?? [];

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
      if (
        orderPhaseFor(t.status as OrderStatus).index === stageIndex &&
        t.createdAt &&
        !date
      )
        date = t.createdAt;
    }
    return date ? fmtDate(date) : "";
  };

  return (
    <div className="track-results" aria-live="polite">
      {/* ── Status card ── */}
      <div className="track-card track-status-card">
        <div className="track-status-head">
          <span className="os-section-title">Order Status</span>
          <div className="track-status-badges">
            {paid ? (
              <span className="badge badge-ok">Paid ✓</span>
            ) : amountNotSet ? (
              <span className="badge badge-warn">Payment Pending</span>
            ) : (
              <PayNowInline
                orderNumber={data.orderNumber}
                total={data.total}
                onPaid={onPaid}
              />
            )}
          </div>
        </div>

        <p className="track-number">{data.orderNumber}</p>

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
                  {stageDate(i) && (
                    <span className="track-step-date">{stageDate(i)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="track-foot">
          <span>
            {data.updatedAt
              ? `Last updated ${fmtDate(data.updatedAt)}`
              : "Last updated —"}
          </span>
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
                    {u.createdAt && (
                      <p className="track-history-date">
                        {fmtDateTime(u.createdAt)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* ── Items + Info grid ── */}
      {hasLines && (
        <div className="track-info-grid">
          <div className="track-card track-items-card">
            <span
              className="os-section-title"
              style={{ padding: "16px 20px 0" }}
            >
              Order Items
            </span>
            {data.services.map((s, i) => (
              <div key={`srv-${i}`} className="track-item-row">
                <span className="track-item-thumb" aria-hidden="true">
                  🛠
                </span>
                <div className="track-item-main">
                  <p className="track-item-name">{s.name}</p>
                  {s.quantity > 1 && (
                    <p className="track-item-meta">Qty {s.quantity}</p>
                  )}
                </div>
                <span className="track-item-total">
                  {formatINR(s.lineTotal)}
                </span>
              </div>
            ))}
            {data.items.map((it, i) => (
              <div key={`item-${i}`} className="track-item-row">
                <span className="track-item-thumb" aria-hidden="true">
                  ⌨
                </span>
                <div className="track-item-main">
                  <p className="track-item-name">{it.name}</p>
                  {it.quantity > 1 && (
                    <p className="track-item-meta">Qty {it.quantity}</p>
                  )}
                </div>
                <span className="track-item-total">
                  {formatINR(it.lineTotal)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(firstRepair || hasShipment) && (
        <div className="track-info-grid">
          {firstRepair && (
            <TrackDeviceCard
              deviceType={firstRepair.deviceType}
              deviceModel={firstRepair.deviceModel}
              issue={firstRepair.issue}
              messages={messages}
            />
          )}
          {hasShipment && (
            <div className="track-card track-info-card track-shipment-card">
              <span className="os-section-title">Shipment</span>

              {shipment!.courier && (
                <div className="track-ship-field">
                  <span className="os-section-title">Courier</span>
                  <p className="track-info-primary">{shipment!.courier}</p>
                </div>
              )}

              {shipment!.status && !shipment!.trackingNumber && (
                <div className="track-ship-field">
                  <span className="os-section-title">Status</span>
                  <p className="track-info-primary">
                    {SHIPMENT_LABELS[shipment!.status] ??
                      humanize(shipment!.status)}
                  </p>
                </div>
              )}

              {(shipment!.trackingNumber || shipment!.trackingUrl) && (
                <div className="track-ship-field">
                  <span className="os-section-title">Tracking</span>
                  {shipment!.trackingNumber && (
                    <p className="track-info-primary track-tracking-num">
                      {shipment!.trackingNumber}
                    </p>
                  )}
                  {shipment!.trackingUrl && !shipment!.trackingNumber && (
                    <p className="track-info-primary track-tracking-num">
                      {shipment!.trackingUrl}
                    </p>
                  )}
                  {shipment!.trackingNumber ? (
                    <Link
                      className="track-ship-link"
                      href={`https://www.delhivery.com/track-v2/package/${shipment!.trackingNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Track on Delhivery ↗
                    </Link>
                  ) : (
                    shipment!.trackingUrl && (
                      <Link
                        className="track-ship-link"
                        href={shipment!.trackingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open courier ↗
                      </Link>
                    )
                  )}
                </div>
              )}

              {shipment!.estimatedDeliveryDate && (
                <div className="track-ship-field">
                  <span className="os-section-title">Est. delivery</span>
                  <p className="track-info-primary">
                    {fmtDate(shipment!.estimatedDeliveryDate)}
                  </p>
                </div>
              )}

              {shipment!.trackingNumber && (
                <LiveTracking waybill={shipment!.trackingNumber} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TrackDeviceCard({
  deviceType,
  deviceModel,
  issue,
  messages,
}: {
  deviceType: string;
  deviceModel: string;
  issue: string;
  messages: TrackData["messages"];
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? messages : messages.slice(0, 3);
  const type = humanize(deviceType);
  // Avoid printing the model twice when it already carries the type/name, and
  // collapse any accidental answer-repeat in the stored test/title value.
  const model = deviceModel.trim().replace(/\s{2,}/g, " ");

  return (
    <div className="track-card track-info-card track-device-card">
      <span className="os-section-title">Device</span>
      <p className="track-device-name">{type}</p>
      {model && model.toLowerCase() !== type.toLowerCase() && (
        <p className="track-device-model">{model}</p>
      )}

      {issue && (
        <>
          <span className="os-section-title track-device-block-label">
            Description
          </span>
          <p className="track-info-secondary track-device-desc">{issue}</p>
        </>
      )}

      <div className="track-messages-block">
        <span className="os-section-title">Updates from the team</span>
        {visible.length === 0 ? (
          <div className="track-messages-empty">
            <p>No updates yet.</p>
            <p>
              We&apos;ll post updates here when there&apos;s something important
              to share.
            </p>
          </div>
        ) : (
          <>
            <ol className="track-feed">
              {visible.map((m, i) => (
                <li
                  key={i}
                  className={`track-feed-item${i === 0 ? " is-latest" : ""}`}
                >
                  <span className="track-feed-dot" aria-hidden="true" />
                  <div className="track-feed-body">
                    <p className="track-feed-title">{m.message}</p>
                    <p className="track-feed-meta">
                      {m.author && `${m.author} · `}
                      {fmtDate(m.createdAt)}
                      {m.createdAt && ` · ${fmtTime(m.createdAt)}`}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            {messages.length > 3 && (
              <button
                type="button"
                className="track-view-more"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
              >
                {showAll
                  ? "Show fewer updates"
                  : `View all updates (${messages.length}) →`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
