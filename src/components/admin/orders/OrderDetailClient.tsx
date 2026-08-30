"use client";

import { useActionState } from "react";
import type { OrderStatus, ShippingStatus } from "@prisma/client";
import {
  updateOrderStatus,
  addTimelineEntry,
  updateShipping,
  addOrderNote,
  archiveOrder,
  type ActionState,
} from "@/app/admin/actions/orders";

const SHIPPING_STATUSES: ShippingStatus[] = [
  "NOT_DISPATCHED",
  "DISPATCHED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "RETURNED",
];

function ActionForm({
  action,
  toastLabel,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  toastLabel: string;
  children: (pending: boolean, state: ActionState) => React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  const success = state.ok === true;
  const errMsg = state.error || (state.ok === false ? "Something went wrong." : "");

  return (
    <>
      {(success || errMsg) && (
        <div className={`kf-toast ${success ? "ok" : "err"}`} role={success ? "status" : "alert"}>
          {success ? `✓ ${toastLabel} saved` : `✕ ${errMsg}`}
        </div>
      )}
      <form action={formAction}>{children(pending, state)}</form>
    </>
  );
}

const Spinner = ({ light = false }: { light?: boolean }) => <span className={`spinner ${light ? "light" : ""}`} aria-hidden />;

export function OrderDetailClient({
  orderId,
  orderNumber,
  currentStatus,
  statuses,
  shipment,
}: {
  orderId: string;
  orderNumber: string;
  currentStatus: OrderStatus;
  statuses: { value: OrderStatus; label: string }[];
  shipment: { courier: string | null; trackingNumber: string | null; trackingUrl: string | null; status: ShippingStatus } | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Status */}
      <div className="admin-card">
        <h3>Order status</h3>
        <ActionForm action={updateOrderStatus} toastLabel="Status change">
          {(pending) => (
            <div className="admin-actions" style={{ alignItems: "flex-end" }}>
              <input type="hidden" name="orderId" value={orderId} />
              <select name="status" className="select" defaultValue={currentStatus} style={{ flex: "1 1 220px" }} disabled={pending}>
                {statuses.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input name="note" className="input" placeholder="Note for this change (optional)" style={{ flex: "2 1 260px" }} disabled={pending} />
              <button type="submit" className="btn-admin primary" disabled={pending}>
                {pending ? <Spinner /> : "Update status"}
              </button>
            </div>
          )}
        </ActionForm>
      </div>

      {/* Timeline entry */}
      <div className="admin-card">
        <h3>Add timeline entry</h3>
        <ActionForm action={addTimelineEntry} toastLabel="Timeline entry">
          {(pending) => (
            <div className="admin-actions" style={{ alignItems: "flex-end" }}>
              <input type="hidden" name="orderId" value={orderId} />
              <select name="status" className="select" style={{ flex: "1 1 220px" }} disabled={pending}>
                {statuses.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <textarea name="note" className="textarea" placeholder="What happened?" style={{ flex: "2 1 260px", minHeight: 44 }} disabled={pending} />
              <button type="submit" className="btn-admin" disabled={pending}>
                {pending ? <Spinner light /> : "Add entry"}
              </button>
            </div>
          )}
        </ActionForm>
      </div>

      {/* Shipping */}
      <div className="admin-card">
        <h3>Shipping & tracking</h3>
        <ActionForm action={updateShipping} toastLabel="Shipping">
          {(pending) => (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input type="hidden" name="orderId" value={orderId} />
              <div className="admin-actions">
                <input name="courier" className="input" placeholder="Courier (e.g. DTDC, Delhivery, BlueDart)" defaultValue={shipment?.courier ?? ""} style={{ flex: "1 1 220px" }} disabled={pending} />
                <input name="trackingNumber" className="input" placeholder="Tracking number" defaultValue={shipment?.trackingNumber ?? ""} style={{ flex: "1 1 200px" }} disabled={pending} />
                <select name="status" className="select" defaultValue={shipment?.status ?? "NOT_DISPATCHED"} style={{ flex: "0 1 160px" }} disabled={pending}>
                  {SHIPPING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-admin" disabled={pending}>
                  {pending ? <Spinner light /> : "Save shipping"}
                </button>
              </div>
              <input name="trackingUrl" className="input" placeholder="Tracking URL (optional)" defaultValue={shipment?.trackingUrl ?? ""} disabled={pending} />
            </div>
          )}
        </ActionForm>
      </div>

      {/* Notes */}
      <div className="admin-card">
        <h3>Add note</h3>
        <ActionForm action={addOrderNote} toastLabel="Note">
          {(pending) => (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input type="hidden" name="orderId" value={orderId} />
              <textarea name="message" className="textarea" placeholder="Internal note, or check the box to share with the customer on their tracking page." disabled={pending} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: "var(--t2)" }}>
                <input type="checkbox" name="visibleToCustomer" value="1" id="visibleToCustomer" disabled={pending} />
                <label htmlFor="visibleToCustomer">Visible to customer</label>
              </div>
              <div>
                <button type="submit" className="btn-admin" disabled={pending}>
                  {pending ? <Spinner light /> : "Add note"}
                </button>
              </div>
            </div>
          )}
        </ActionForm>
      </div>

      {/* Archive */}
      <div className="admin-card">
        <h3>Danger zone</h3>
        <ActionForm action={archiveOrder} toastLabel="Archive">
          {(pending) => (
            <div className="admin-actions">
              <input type="hidden" name="orderId" value={orderId} />
              <button
                type="submit"
                className="btn-admin danger"
                disabled={pending}
                onClick={(e) => {
                  if (!confirm(`Archive order ${orderNumber}? It will be hidden from the admin list and tracking page.`)) e.preventDefault();
                }}
              >
                {pending ? <Spinner light /> : "Archive order"}
              </button>
            </div>
          )}
        </ActionForm>
      </div>
    </div>
  );
}