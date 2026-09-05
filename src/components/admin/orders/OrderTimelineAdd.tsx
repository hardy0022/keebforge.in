"use client";

import type { OrderStatus } from "@prisma/client";
import { addTimelineEntry } from "@/app/admin/actions/orders";
import { ActionForm, Spinner } from "./ActionForm";

export function OrderTimelineAdd({
  orderId,
  statuses,
}: {
  orderId: string;
  statuses: { value: OrderStatus; label: string }[];
}) {
  return (
    <ActionForm action={addTimelineEntry} okLabel="Timeline entry added">
      {(pending) => (
        <div className="admin-actions" style={{ alignItems: "stretch" }}>
          <input type="hidden" name="orderId" value={orderId} />
          <select name="status" className="select" style={{ flex: "1 1 190px" }} disabled={pending}>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <textarea name="note" className="textarea" placeholder="What happened? (recommended)" style={{ flex: "2 1 220px", minHeight: 40 }} disabled={pending} />
          <button type="submit" className="btn-admin primary" disabled={pending}>
            {pending ? <Spinner /> : "Add timeline update"}
          </button>
        </div>
      )}
    </ActionForm>
  );
}