"use client";

import { useState } from "react";
import type { ShippingStatus } from "@prisma/client";
import { formatINR } from "@/lib/money";
import { updateShipping, createShipmentDelivery } from "@/app/admin/actions/orders";
import { ActionForm, Spinner } from "./ActionForm";

const SHIP_STATUSES: ShippingStatus[] = [
  "NOT_DISPATCHED",
  "DISPATCHED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "RETURNED",
];

export function ShippingPanel({
  orderId,
  shipment,
  weightGrams,
  shippingMode,
  defaults,
  hasAddress,
}: {
  orderId: string;
  shipment: { courier: string | null; trackingNumber: string | null; trackingUrl: string | null; status: ShippingStatus } | null;
  weightGrams?: number | null;
  shippingMode?: string | null;
  defaults?: { weightGrams?: number | null; declaredValuePaise?: number };
  hasAddress: boolean;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const shipped = Boolean(shipment?.trackingNumber);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {shipped ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <div style={{ fontSize: "0.68rem", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>
              {shipment?.courier ?? "Courier"}
            </div>
            <div style={{ fontSize: "1.05rem", fontWeight: 700, wordBreak: "break-word" }} className="num">
              {shipment?.trackingNumber ?? "—"}
            </div>
          </div>
          <span className={`badge ${shipment?.status === "DELIVERED" ? "badge-ok" : shipment?.status === "NOT_DISPATCHED" ? "badge-warn" : ""}`}>
            {(shipment?.status ?? "NOT_DISPATCHED").replace(/_/g, " ")}
          </span>
          {shippingMode && <span className="muted">Mode: <b>{shippingMode}</b></span>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {shipment?.trackingUrl && (
              <a className="btn-admin" href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer">
                View tracking ↗
              </a>
            )}
            <button type="button" className="btn-admin sm" onClick={() => setShowEdit((o) => !o)}>
              {showEdit ? "Close" : "Edit tracking"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <span className="badge badge-warn">Not dispatched yet</span>
          {!hasAddress && (
            <span className="muted">No shipping address on file — add one below before creating a courier shipment.</span>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className="btn-admin primary" onClick={() => setShowCreate((o) => !o)}>
              {showCreate ? "Close" : "Create shipment"}
            </button>
            <button type="button" className="btn-admin" onClick={() => setShowEdit((o) => !o)}>
              {showEdit ? "Close" : "Save tracking manually"}
            </button>
          </div>
        </div>
      )}

      {(weightGrams || shippingMode) && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }} className="muted">
          {weightGrams ? <span>Package weight: <b className="num">{weightGrams} gm</b></span> : null}
          {shippingMode ? <span>Mode: <b>{shippingMode}</b></span> : null}
        </div>
      )}

      {!shipped && showCreate && (
        <div style={{ borderTop: "1px dashed var(--bdr)", paddingTop: 12 }}>
          <ActionForm
            action={createShipmentDelivery}
            okLabel={(s) => (s.ok && s.message ? `Shipment created — waybill ${s.message}` : "Shipment created")}
          >
            {(pending) => (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input type="hidden" name="orderId" value={orderId} />
                <p style={{ fontSize: "0.8rem", color: "var(--t2)", margin: 0 }}>
                  Manifests this order with Delhivery and saves the returned waybill as the tracking number. Weight and declared
                  value default to the order&apos;s data — adjust if the actual package differs.
                </p>
                <div className="admin-actions">
                  <input name="weightGrams" type="number" min={1} className="input" placeholder="Package weight (grams) *" defaultValue={defaults?.weightGrams ?? ""} required style={{ flex: "1 1 160px" }} disabled={pending} />
                  <input name="declaredValue" type="number" min={1} className="input" placeholder={`Declared value ₹ (${defaults?.declaredValuePaise ? formatINR(defaults.declaredValuePaise) : "auto"})`} style={{ flex: "1 1 170px" }} disabled={pending} />
                  <input name="lengthCm" type="number" min={1} className="input" placeholder="L cm" defaultValue={20} style={{ flex: "1 1 80px" }} disabled={pending} />
                  <input name="widthCm" type="number" min={1} className="input" placeholder="W cm" defaultValue={20} style={{ flex: "1 1 80px" }} disabled={pending} />
                  <input name="heightCm" type="number" min={1} className="input" placeholder="H cm" defaultValue={20} style={{ flex: "1 1 80px" }} disabled={pending} />
                  <button type="submit" className="btn-admin primary" disabled={pending}>
                    {pending ? <Spinner /> : "Create shipment (Delhivery)"}
                  </button>
                </div>
              </div>
            )}
          </ActionForm>
        </div>
      )}

      {showEdit && (
        <div style={{ borderTop: "1px dashed var(--bdr)", paddingTop: 12 }}>
          <ActionForm action={updateShipping} okLabel="Shipping details saved">
            {(pending) => (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input type="hidden" name="orderId" value={orderId} />
                <div className="admin-actions">
                  <input name="courier" className="input" placeholder="Courier (e.g. Delhivery, DTDC, BlueDart)" defaultValue={shipment?.courier ?? ""} style={{ flex: "1 1 200px" }} disabled={pending} />
                  <input name="trackingNumber" className="input" placeholder="Tracking number" defaultValue={shipment?.trackingNumber ?? ""} style={{ flex: "1 1 160px" }} disabled={pending} />
                  <select name="status" className="select" defaultValue={shipment?.status ?? "NOT_DISPATCHED"} style={{ flex: "0 1 160px" }} disabled={pending}>
                    {SHIP_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="btn-admin" disabled={pending}>
                    {pending ? <Spinner light /> : "Save"}
                  </button>
                </div>
                <input name="trackingUrl" className="input" placeholder="Tracking URL (optional)" defaultValue={shipment?.trackingUrl ?? ""} disabled={pending} />
              </div>
            )}
          </ActionForm>
        </div>
      )}
    </div>
  );
}