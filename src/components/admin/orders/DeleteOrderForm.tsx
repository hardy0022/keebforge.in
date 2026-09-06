"use client";

import { deleteOrder } from "@/app/admin/actions/orders";
import { ActionForm, Spinner } from "./ActionForm";

export function DeleteOrderForm({
  orderId,
  orderNumber,
}: {
  orderId: string;
  orderNumber: string;
}) {
  return (
    <ActionForm action={deleteOrder} okLabel="Order deleted">
      {(pending) => (
        <div className="admin-actions">
          <input type="hidden" name="orderId" value={orderId} />
          <button
            type="submit"
            className="btn-admin danger"
            disabled={pending}
            onClick={(e) => {
              if (
                !confirm(
                  `Permanently delete order ${orderNumber}? This cannot be undone.`,
                )
              )
                e.preventDefault();
            }}
          >
            {pending ? <Spinner light /> : "Delete order"}
          </button>
        </div>
      )}
    </ActionForm>
  );
}
