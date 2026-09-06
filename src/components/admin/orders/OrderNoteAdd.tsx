"use client";

import { addOrderNote } from "@/app/admin/actions/orders";
import { ActionForm, Spinner } from "./ActionForm";

export function OrderNoteAdd({ orderId }: { orderId: string }) {
  return (
    <ActionForm action={addOrderNote} okLabel="Note saved">
      {(pending) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input type="hidden" name="orderId" value={orderId} />
          <textarea
            name="message"
            className="textarea"
            placeholder="Internal note — tick to share with the customer on their tracking page."
            style={{ minHeight: 44 }}
            disabled={pending}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: "0.78rem",
                color: "var(--t2)",
              }}
            >
              <input
                type="checkbox"
                name="visibleToCustomer"
                value="1"
                disabled={pending}
              />
              Visible to customer
            </label>
            <button
              type="submit"
              className="btn-admin primary"
              disabled={pending}
            >
              {pending ? <Spinner /> : "Add note"}
            </button>
          </div>
        </div>
      )}
    </ActionForm>
  );
}
