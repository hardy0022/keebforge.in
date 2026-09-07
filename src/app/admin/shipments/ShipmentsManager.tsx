"use client";

import { useState } from "react";
import Link from "next/link";
import type { ShippingStatus } from "@prisma/client";
import { fmtIST } from "@/lib/utils/ist";
import { bookWarehousePickup } from "@/app/admin/actions/orders";
import {
  DELHIVERY_PICKUP_SLOTS,
  nextPickup,
  slotLabel,
} from "@/lib/shipping/pickup-slots";
import { ActionForm, Spinner } from "@/components/admin/orders/ActionForm";

const SHIP_STATUSES: ShippingStatus[] = [
  "NOT_DISPATCHED",
  "DISPATCHED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "RETURNED",
];

const SHIP_STATUS_LABELS: Record<ShippingStatus, string> = {
  NOT_DISPATCHED: "Not dispatched",
  DISPATCHED: "Dispatched",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  RETURNED: "Returned",
};

export type ShipmentRow = {
  id: string;
  courier: string | null;
  trackingNumber: string | null;
  status: ShippingStatus;
  pickupId: string | null;
  createdAt: string;
  order: {
    orderNumber: string;
    customerName: string;
    customerEmail: string;
    shippingDestinationPincode: string | null;
  };
};

export function ShipmentsManager({
  rows,
  status,
}: {
  rows: ShipmentRow[];
  status?: ShippingStatus;
}) {
  const pickable = rows.filter(
    (s) =>
      s.trackingNumber && s.status !== "DELIVERED" && s.status !== "RETURNED",
  );
  const [selected, setSelected] = useState<string[]>(pickable.map((s) => s.id));
  const toggle = (id: string) =>
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  const pickupDefault = nextPickup();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        className="admin-card"
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div>
          <b>Book a warehouse pickup</b>
          <span
            style={{
              fontSize: "0.78rem",
              color: "var(--t2)",
              display: "block",
            }}
          >
            Tick the shipments to hand over (below) — {selected.length}{" "}
            selected. Courier pickup at the warehouse configured in Admin →
            Settings → Shipping.
          </span>
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "end",
            justifyContent: "space-between",
          }}
        >
          <ActionForm action={bookWarehousePickup} okLabel="Pickup booked">
            {(pending) => (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  alignItems: "end",
                }}
              >
                <input
                  type="hidden"
                  name="shipmentIds"
                  value={selected.join(",")}
                />
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <span style={{ fontSize: "0.72rem", color: "var(--t2)" }}>
                    Date
                  </span>
                  <input
                    name="pickupDate"
                    type="date"
                    className="input"
                    defaultValue={pickupDefault.dateKey}
                    required
                    disabled={pending}
                  />
                </label>
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <span style={{ fontSize: "0.72rem", color: "var(--t2)" }}>
                    Pickup slot
                  </span>
                  <select
                    name="pickupTime"
                    className="select"
                    style={{ width: 165 }}
                    defaultValue={pickupDefault.slotStart}
                    required
                    disabled={pending}
                  >
                    {DELHIVERY_PICKUP_SLOTS.map((s) => (
                      <option key={s.start} value={s.start}>
                        {slotLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="btn-admin primary"
                  disabled={pending || selected.length === 0}
                >
                  {pending ? (
                    <Spinner />
                  ) : (
                    `Book pickup (${selected.length} pkg)`
                  )}
                </button>
              </div>
            )}
          </ActionForm>

          <form
            method="get"
            action="/admin/shipments"
            style={{
              display: "flex",
              flexWrap: "nowrap",
              gap: 10,
              alignItems: "center",
            }}
          >
            <select
              className="select"
              name="status"
              defaultValue={status ?? ""}
              style={{ width: 180, flex: "0 0 auto" }}
            >
              <option value="">Active</option>
              {SHIP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SHIP_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-admin primary">
              Filter
            </button>
            {status && (
              <Link href="/admin/shipments" className="btn-admin">
                Clear
              </Link>
            )}
          </form>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <b>No shipments found</b>
          Manifest an order from the order page — its Delhivery waybill shows up
          here.
        </div>
      ) : (
        <div className="admin-card" style={{ padding: 8 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    {pickable.length ? `Pick (${selected.length})` : ""}
                  </th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Destination</th>
                  <th>Courier</th>
                  <th>Waybill</th>
                  <th>Delivery status</th>
                  <th>Booked</th>
                  <th>Pickup ID</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const isPickable = pickable.some((p) => p.id === s.id);
                  const checked = selected.includes(s.id);
                  return (
                    <tr key={s.id}>
                      <td style={{ textAlign: "center" }}>
                        {isPickable ? (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(s.id)}
                            aria-label={`Include ${s.order.orderNumber} in pickup`}
                          />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <Link
                          href={`/admin/orders/${s.order.orderNumber}`}
                          style={{ color: "var(--acc)", fontWeight: 600 }}
                        >
                          {s.order.orderNumber}
                        </Link>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                          {s.order.customerName}
                        </div>
                        <div
                          className="muted num"
                          style={{ fontSize: "0.7rem" }}
                        >
                          {s.order.customerEmail}
                        </div>
                      </td>
                      <td className="num">
                        {s.order.shippingDestinationPincode ?? "—"}
                      </td>
                      <td>{s.courier ?? "—"}</td>
                      <td
                        className="num"
                        style={{ fontFamily: "var(--ff-mono)" }}
                      >
                        {s.trackingNumber ?? "—"}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            s.status === "DELIVERED"
                              ? "badge-ok"
                              : s.status === "NOT_DISPATCHED"
                                ? "badge-warn"
                                : ""
                          }`}
                        >
                          {SHIP_STATUS_LABELS[s.status]}
                        </span>
                      </td>
                      <td className="muted num">
                        {fmtIST(new Date(s.createdAt), {
                          day: "2-digit",
                          month: "short",
                          ...(new Date(s.createdAt).getFullYear() !==
                          new Date().getFullYear()
                            ? { year: "numeric" }
                            : {}),
                        })}
                      </td>
                      <td className="num" style={{ fontFamily: "var(--ff-mono)" }}>
                        {s.pickupId ?? (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
