"use client";

import { useState } from "react";
import type { ShippingStatus } from "@prisma/client";
import { formatINR } from "@/lib/utils/money";
import { fmtIST } from "@/lib/utils/ist";
import { delhiveryStatusLabel } from "@/lib/shipping/track-phases";
import {
  DELHIVERY_PICKUP_SLOTS,
  nextPickup,
  slotLabel,
} from "@/lib/shipping/pickup-slots";
import {
  updateShipping,
  createShipmentDelivery,
  updateShipmentDelivery,
  cancelShipmentDelivery,
  bookPickupDelivery,
} from "@/app/admin/actions/orders";
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
  live,
  weightGrams,
  shippingMode,
  defaults,
  hasAddress,
}: {
  orderId: string;
  shipment: {
    courier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    status: ShippingStatus;
  } | null;
  live?: {
    status?: string;
    destination?: string;
    latestScan?: {
      status: string;
      location: string;
      instructions: string;
      scannedAt: string | null;
    };
    error?: string;
  };
  weightGrams?: number | null;
  shippingMode?: string | null;
  defaults?: { weightGrams?: number | null; declaredValuePaise?: number };
  hasAddress: boolean;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [showPickup, setShowPickup] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [updatePt, setUpdatePt] = useState<"Pre-paid" | "COD">("Pre-paid");
  const shipped = Boolean(shipment?.trackingNumber);
  const isDelhivery = shipped && shipment?.courier === "Delhivery";
  const pickupDefault = nextPickup();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {shipped ? (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.68rem",
                  color: "var(--t3)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontWeight: 700,
                }}
              >
                {shipment?.courier ?? "Courier"}
              </div>
              <div
                style={{
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  wordBreak: "break-word",
                }}
                className="num"
              >
                {shipment?.trackingNumber ?? "—"}
              </div>
            </div>
            <span
              className={`badge ${shipment?.status === "DELIVERED" ? "badge-ok" : shipment?.status === "NOT_DISPATCHED" ? "badge-warn" : ""}`}
            >
              {(shipment?.status ?? "NOT_DISPATCHED").replace(/_/g, " ")}
            </span>
            {shippingMode && (
              <span className="muted">
                Mode: <b>{shippingMode}</b>
              </span>
            )}
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {shipment?.trackingUrl && (
                <a
                  className="btn-admin"
                  href={shipment.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View tracking ↗
                </a>
              )}
              <button
                type="button"
                className="btn-admin sm"
                onClick={() => setShowEdit((o) => !o)}
              >
                {showEdit ? "Close" : "Edit tracking"}
              </button>
            </div>
          </div>

          {shipped && live && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "10px 12px",
                borderRadius: "var(--r-sm)",
                border: "1px solid var(--bdr)",
                background: "var(--surf)",
                fontSize: "0.82rem",
              }}
            >
              {live.error ? (
                <div className="muted" style={{ fontSize: "0.75rem" }}>
                  Live Delhivery status unavailable: {live.error}
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <span
                      className={`badge ${/delivered/i.test(live.status ?? "") ? "badge-ok" : /return|rto|in transit/i.test(live.status ?? "") ? "badge-warn" : ""}`}
                      title={`Live status from Delhivery: ${live.status ?? ""}`}
                    >
                      {delhiveryStatusLabel(live.status ?? "") || "In Transit"}
                    </span>
                    {live.destination && (
                      <span className="muted num">→ {live.destination}</span>
                    )}
                    <span
                      className="muted"
                      style={{
                        fontSize: "0.68rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                      }}
                    >
                      Live · Delhivery
                    </span>
                  </div>
                  {live.latestScan && (
                    <div
                      className="muted"
                      style={{ fontSize: "0.75rem", lineHeight: 1.5 }}
                    >
                      {live.latestScan.status
                        ? `${live.latestScan.status} — `
                        : ""}
                      {[
                        live.latestScan.location,
                        live.latestScan.scannedAt
                          ? fmtIST(new Date(live.latestScan.scannedAt), {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {live.latestScan.instructions &&
                        live.latestScan.instructions !==
                          live.latestScan.status && (
                          <span> ({live.latestScan.instructions})</span>
                        )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span className="badge badge-warn">Not dispatched yet</span>
          {!hasAddress && (
            <span className="muted">
              No shipping address on file — add one below before creating a
              courier shipment.
            </span>
          )}
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="btn-admin primary"
              onClick={() => setShowCreate((o) => !o)}
            >
              {showCreate ? "Close" : "Create shipment"}
            </button>
            <button
              type="button"
              className="btn-admin"
              onClick={() => setShowEdit((o) => !o)}
            >
              {showEdit ? "Close" : "Save tracking manually"}
            </button>
          </div>
        </div>
      )}

      {isDelhivery && (
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 2,
          }}
        >
          <button
            type="button"
            className="btn-admin sm"
            onClick={() => setShowUpdate((o) => !o)}
          >
            {showUpdate ? "Close" : "Update shipment"}
          </button>
          <button
            type="button"
            className="btn-admin sm"
            onClick={() => setShowPickup((o) => !o)}
          >
            {showPickup ? "Close" : "Book pickup"}
          </button>
          <button
            type="button"
            className="btn-admin sm"
            onClick={() => setShowCancel((o) => !o)}
            style={{ color: showCancel ? "var(--t1)" : "var(--err)" }}
          >
            {showCancel ? "Close" : "Cancel shipment"}
          </button>
        </div>
      )}

      {(weightGrams || shippingMode) && (
        <div
          style={{ display: "flex", gap: 14, flexWrap: "wrap" }}
          className="muted"
        >
          {weightGrams ? (
            <span>
              Package weight: <b className="num">{weightGrams} gm</b>
            </span>
          ) : null}
          {shippingMode ? (
            <span>
              Mode: <b>{shippingMode}</b>
            </span>
          ) : null}
        </div>
      )}

      {!shipped && showCreate && (
        <div style={{ borderTop: "1px dashed var(--bdr)", paddingTop: 12 }}>
          <ActionForm
            action={createShipmentDelivery}
            okLabel={(s) =>
              s.ok && s.message
                ? `Shipment created — waybill ${s.message}`
                : "Shipment created"
            }
          >
            {(pending) => (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <input type="hidden" name="orderId" value={orderId} />
                <p
                  style={{ fontSize: "0.8rem", color: "var(--t2)", margin: 0 }}
                >
                  Manifests this order with Delhivery and saves the returned
                  waybill as the tracking number. Weight and declared value
                  default to the order&apos;s data — adjust if the actual
                  package differs.
                </p>
                <div className="admin-actions">
                  <input
                    name="weightGrams"
                    type="number"
                    min={1}
                    className="input"
                    placeholder="Package weight (grams) *"
                    defaultValue={defaults?.weightGrams ?? ""}
                    required
                    style={{ flex: "1 1 160px" }}
                    disabled={pending}
                  />
                  <input
                    name="declaredValue"
                    type="number"
                    min={1}
                    className="input"
                    placeholder={`Declared value ₹ (${defaults?.declaredValuePaise ? formatINR(defaults.declaredValuePaise) : "auto"})`}
                    style={{ flex: "1 1 170px" }}
                    disabled={pending}
                  />
                  <input
                    name="lengthCm"
                    type="number"
                    min={1}
                    className="input"
                    placeholder="L cm"
                    defaultValue={20}
                    style={{ flex: "1 1 80px" }}
                    disabled={pending}
                  />
                  <input
                    name="widthCm"
                    type="number"
                    min={1}
                    className="input"
                    placeholder="W cm"
                    defaultValue={20}
                    style={{ flex: "1 1 80px" }}
                    disabled={pending}
                  />
                  <input
                    name="heightCm"
                    type="number"
                    min={1}
                    className="input"
                    placeholder="H cm"
                    defaultValue={20}
                    style={{ flex: "1 1 80px" }}
                    disabled={pending}
                  />
                  <button
                    type="submit"
                    className="btn-admin primary"
                    disabled={pending}
                  >
                    {pending ? <Spinner /> : "Create shipment (Delhivery)"}
                  </button>
                </div>
              </div>
            )}
          </ActionForm>
        </div>
      )}

      {isDelhivery && showUpdate && (
        <div style={{ borderTop: "1px dashed var(--bdr)", paddingTop: 12 }}>
          <ActionForm
            action={updateShipmentDelivery}
            okLabel="Shipment updated with Delhivery"
          >
            {(pending) => (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <input type="hidden" name="orderId" value={orderId} />
                <p
                  style={{ fontSize: "0.8rem", color: "var(--t2)", margin: 0 }}
                >
                  Adjusts the manifested package&apos;s weight, dimensions, and
                  COD details at Delhivery (waybill{" "}
                  <b className="num">{shipment?.trackingNumber}</b>).
                </p>
                <div className="admin-actions">
                  <input
                    name="weightGrams"
                    type="number"
                    step="any"
                    min={0.1}
                    className="input"
                    placeholder="Weight (grams) *"
                    defaultValue={defaults?.weightGrams ?? weightGrams ?? ""}
                    required
                    style={{ flex: "1 1 140px" }}
                    disabled={pending}
                  />
                  <select
                    name="paymentType"
                    className="select"
                    value={updatePt}
                    onChange={(e) =>
                      setUpdatePt(e.target.value as "Pre-paid" | "COD")
                    }
                    style={{ flex: "0 1 130px" }}
                    disabled={pending}
                  >
                    <option value="Pre-paid">Pre-paid</option>
                    <option value="COD">COD</option>
                  </select>
                  {updatePt === "COD" && (
                    <input
                      name="codAmount"
                      type="number"
                      step="any"
                      min={0}
                      className="input"
                      placeholder="COD amount ₹"
                      style={{ flex: "1 1 130px" }}
                      disabled={pending}
                    />
                  )}
                  <input
                    name="lengthCm"
                    type="number"
                    min={1}
                    className="input"
                    placeholder="L cm"
                    style={{ flex: "1 1 70px" }}
                    disabled={pending}
                  />
                  <input
                    name="widthCm"
                    type="number"
                    min={1}
                    className="input"
                    placeholder="W cm"
                    style={{ flex: "1 1 70px" }}
                    disabled={pending}
                  />
                  <input
                    name="heightCm"
                    type="number"
                    min={1}
                    className="input"
                    placeholder="H cm"
                    style={{ flex: "1 1 70px" }}
                    disabled={pending}
                  />
                  <button
                    type="submit"
                    className="btn-admin primary"
                    disabled={pending}
                  >
                    {pending ? <Spinner /> : "Update shipment"}
                  </button>
                </div>
              </div>
            )}
          </ActionForm>
        </div>
      )}

      {isDelhivery && showPickup && (
        <div style={{ borderTop: "1px dashed var(--bdr)", paddingTop: 12 }}>
          <ActionForm action={bookPickupDelivery} okLabel="Pickup booked">
            {(pending) => (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <input type="hidden" name="orderId" value={orderId} />
                <p
                  style={{ fontSize: "0.8rem", color: "var(--t2)", margin: 0 }}
                >
                  Books a Delhivery courier pickup at the warehouse configured
                  in Admin → Settings → Shipping.
                </p>
                <div className="admin-actions">
                  <input
                    name="pickupDate"
                    type="date"
                    className="input"
                    defaultValue={pickupDefault.dateKey}
                    required
                    style={{ flex: "1 1 150px" }}
                    disabled={pending}
                  />
                  <select
                    name="pickupTime"
                    className="select"
                    defaultValue={pickupDefault.slotStart}
                    required
                    style={{ flex: "1 1 160px" }}
                    disabled={pending}
                  >
                    {DELHIVERY_PICKUP_SLOTS.map((s) => (
                      <option key={s.start} value={s.start}>
                        {slotLabel(s)}
                      </option>
                    ))}
                  </select>
                  <input
                    name="packageCount"
                    type="number"
                    min={1}
                    max={100}
                    className="input"
                    placeholder="Packages"
                    defaultValue={1}
                    required
                    style={{ flex: "1 1 90px" }}
                    disabled={pending}
                  />
                  <button
                    type="submit"
                    className="btn-admin primary"
                    disabled={pending}
                  >
                    {pending ? <Spinner /> : "Book pickup"}
                  </button>
                </div>
              </div>
            )}
          </ActionForm>
        </div>
      )}

      {isDelhivery && showCancel && (
        <div style={{ borderTop: "1px dashed var(--bdr)", paddingTop: 12 }}>
          <ActionForm
            action={cancelShipmentDelivery}
            okLabel="Shipment cancelled"
          >
            {(pending) => (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <input type="hidden" name="orderId" value={orderId} />
                <p
                  style={{ fontSize: "0.8rem", color: "var(--t2)", margin: 0 }}
                >
                  Cancels waybill{" "}
                  <b className="num">{shipment?.trackingNumber}</b> at Delhivery
                  and clears the tracking number so this order can be manifested
                  again. Type <b style={{ color: "var(--err)" }}>YES</b> to
                  confirm.
                </p>
                <div className="admin-actions">
                  <input
                    name="confirm"
                    className="input"
                    placeholder='Type "YES" to confirm'
                    required
                    style={{ flex: "1 1 180px" }}
                    disabled={pending}
                  />
                  <button
                    type="submit"
                    className="btn-admin"
                    disabled={pending}
                    style={{ color: "var(--err)" }}
                  >
                    {pending ? <Spinner /> : "Cancel shipment (Delhivery)"}
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
              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                <input type="hidden" name="orderId" value={orderId} />
                <div className="admin-actions">
                  <input
                    name="courier"
                    className="input"
                    placeholder="Courier (e.g. Delhivery, DTDC, BlueDart)"
                    defaultValue={shipment?.courier ?? ""}
                    style={{ flex: "1 1 200px" }}
                    disabled={pending}
                  />
                  <input
                    name="trackingNumber"
                    className="input"
                    placeholder="Tracking number"
                    defaultValue={shipment?.trackingNumber ?? ""}
                    style={{ flex: "1 1 160px" }}
                    disabled={pending}
                  />
                  <select
                    name="status"
                    className="select"
                    defaultValue={shipment?.status ?? "NOT_DISPATCHED"}
                    style={{ flex: "0 1 160px" }}
                    disabled={pending}
                  >
                    {SHIP_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="btn-admin"
                    disabled={pending}
                  >
                    {pending ? <Spinner light /> : "Save"}
                  </button>
                </div>
                <input
                  name="trackingUrl"
                  className="input"
                  placeholder="Tracking URL (optional)"
                  defaultValue={shipment?.trackingUrl ?? ""}
                  disabled={pending}
                />
              </div>
            )}
          </ActionForm>
        </div>
      )}
    </div>
  );
}
