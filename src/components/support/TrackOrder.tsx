"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { OrderStatus } from "@prisma/client";
import { trackOrder, type TrackData, type TrackState } from "@/app/actions/track-order";
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

function payBadge(status: string): string {
  if (status === "PAID") return "badge-ok";
  if (status === "REFUNDED") return "badge-lime";
  if (status === "FAILED") return "badge-err";
  return "badge-warn";
}

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

export function TrackOrder() {
  const [state, formAction, pending] = useActionState<TrackState, FormData>(trackOrder, { ok: false, error: "" });

  function reTrack(orderNumber: string) {
    const fd = new FormData();
    fd.set("orderNumber", orderNumber);
    formAction(fd);
  }

  return (
    <section className="track-section">
      <div className="wrap">
        <div className="track-wrap">
          <RazorpayScript />
          <form action={formAction} className="track-form">
            <div className="track-field">
              <label htmlFor="track-order-number" className="track-label">
                Order Number
              </label>
              <div className="track-row">
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
                  aria-describedby="track-hint"
                />
                <button type="submit" className="btn-prime" disabled={pending}>
                  {pending ? "Tracking…" : "Track Order"}
                </button>
              </div>
            </div>
            <p id="track-hint" className="track-hint">
              Order numbers look like KF30X2A — yours is in your order confirmation email.
            </p>
          </form>

          {!state.ok && state.error && (
            <p role="alert" className="track-error">
              {state.error}
            </p>
          )}

          {state.ok && <TrackResult data={state.data} onPaid={() => reTrack(state.data.orderNumber)} />}
        </div>
      </div>
    </section>
  );
}

function PayNow({ orderNumber, total, onPaid }: { orderNumber: string; total: number; onPaid: () => void }) {
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
        setError(data?.error ?? "Could not start payment. Please try again.");
        setBusy(false);
        return;
      }
      launchRazorpayPayment({
        order: data,
        description: `Payment for order ${data.orderNumber}`,
        prefill: { name: data.customerName ?? "", email: data.customerEmail ?? "", contact: data.customerPhone ?? "" },
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
      setError("Could not reach the payment server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="track-pay">
      <p className="track-module-label">Payment Required</p>
      <div className="track-pay-row">
        <p className="track-pay-amount">
          {formatINR(total)} <span className="track-pay-due">due</span>
        </p>
        <button type="button" className="btn-prime track-pay-btn" onClick={() => void pay()} disabled={busy}>
          {busy ? "Opening payment…" : `Pay ${formatINR(total)} now`}
        </button>
      </div>
      {error && (
        <p role="alert" className="track-pay-error">
          {error}
        </p>
      )}
      <p className="track-pay-hint">Secure payment via Razorpay — UPI, cards, netbanking &amp; more.</p>
    </div>
  );
}

function TrackResult({ data, onPaid }: { data: TrackData; onPaid: () => void }) {
  const phase = orderPhaseFor(data.status as OrderStatus);
  const shipment = data.shipment;
  const firstRepair = data.repairs[0];
  const latest = data.timeline[data.timeline.length - 1];
  const hasLines = data.items.length > 0 || data.services.length > 0;
  const hasShipment = !!(shipment && (shipment.courier || shipment.trackingNumber || shipment.trackingUrl || shipment.status || shipment.estimatedDeliveryDate));
  const canPay = data.paymentStatus === "PENDING" && data.total > 0;

  return (
    <div className="track-results" aria-live="polite">
      {/* Main status panel */}
      <div className="track-card">
        <div className="track-head">
          <div>
            <p className="track-label">Order</p>
            <p className="track-number">{data.orderNumber}</p>
          </div>
          <div className="track-badges">
            <span className={`badge ${payBadge(data.paymentStatus)}`}>{humanize(data.paymentStatus)}</span>
            <span className="badge badge-lime">{data.statusLabel}</span>
          </div>
        </div>

        {canPay && <PayNow orderNumber={data.orderNumber} total={data.total} onPaid={onPaid} />}

        <div className="track-progress">
          <p className="track-module-label">Order Progress</p>
          <div className="track-steps">
            {ORDER_PHASE_LABELS.map((label, i) => (
              <div
                key={label}
                className={`track-step${i < phase.index ? " is-done" : i === phase.index ? " is-current" : ""}`}
              >
                <span className="track-step-dot" aria-hidden="true" />
                <span className="track-step-label">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="track-foot">
          <span>
            <strong>{formatINR(data.total)}</strong> total
          </span>
          <span>{data.updatedAt ? `Last updated ${fmtDate(data.updatedAt)}` : "Last updated —"}</span>
        </div>
      </div>

      {latest?.note && (
        <p className="track-latest">
          Latest update <b>{latest.label}</b> — {latest.note}
        </p>
      )}

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

        {hasLines && (
          <div className="track-detail">
            <dt>{data.services.length ? "Services" : "Items"}</dt>
            <dd>
              <div className="track-items">
                {data.services.map((s, i) => (
                  <span key={`s-${i}`}>
                    <b>{s.name}</b>
                    {s.quantity > 1 ? ` × ${s.quantity}` : ""} · {formatINR(s.lineTotal)}
                  </span>
                ))}
                {data.items.map((it, i) => (
                  <span key={`i-${i}`}>
                    <b>{it.name}</b>
                    {it.quantity > 1 ? ` × ${it.quantity}` : ""} · {formatINR(it.lineTotal)}
                  </span>
                ))}
              </div>
            </dd>
          </div>
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
          </>
        )}
      </dl>
    </div>
  );
}
