"use client";

import { useState } from "react";
import type { OrderStatus } from "@prisma/client";
import { updateOrderStatus } from "@/app/admin/actions/orders";
import { ActionForm, Spinner } from "./ActionForm";

export function OrderHeaderActions({
  orderId,
  currentStatus,
  statuses,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  statuses: { value: OrderStatus; label: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "flex-end",
      }}
    >
      <div className="admin-actions" style={{ justifyContent: "flex-end" }}>
        <button
          type="button"
          className={`btn-admin ${open ? "" : "primary"}`}
          onClick={() => setOpen((o) => !o)}
        >
          Update Status
        </button>
        <details className="order-more">
          <summary className="btn-admin">More</summary>
          <div className="order-more-menu">
            <a href="#financial">Financial summary</a>
            <a href="#timeline">Timeline</a>
            <a href="#notes">Internal notes</a>
            <a href="#delivery">Delivery & shipping</a>
            <a href="#danger" style={{ color: "var(--err)" }}>
              Danger zone
            </a>
          </div>
        </details>
      </div>
      {open && (
        <div
          className="admin-card"
          style={{ padding: 14, width: "min(560px, 100%)" }}
        >
          <ActionForm action={updateOrderStatus} okLabel="Status updated">
            {(pending) => (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input type="hidden" name="orderId" value={orderId} />
                <div className="admin-actions" style={{ alignItems: "center" }}>
                  <select
                    name="status"
                    className="select"
                    defaultValue={currentStatus}
                    style={{ flex: "1 1 220px" }}
                    disabled={pending}
                  >
                    {statuses.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="btn-admin primary"
                    disabled={pending}
                  >
                    {pending ? <Spinner /> : "Save status"}
                  </button>
                  <button
                    type="button"
                    className="btn-admin"
                    onClick={() => setOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <input
                  name="note"
                  className="input"
                  placeholder="Note for the timeline (optional)"
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
