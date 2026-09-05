"use client";

import { useActionState, useState } from "react";
import { updateOrderAmounts, recordManualPayment, type ActionState } from "@/app/admin/actions/orders";
import { Toast, Spinner } from "./ActionForm";

const inr = (paise: number) => Math.round(paise / 100);

function toPaise(fd: FormData, field: string): number {
  return Math.round((Number(fd.get(field)) || 0) * 100);
}

const Field = ({
  name,
  label,
  defaultValue,
  disabled,
}: {
  name: string;
  label: string;
  defaultValue: number;
  disabled?: boolean;
}) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.78rem", color: "var(--t3)" }}>
    {label}
    <input name={name} type="number" min={0} step={1} defaultValue={defaultValue} className="input" disabled={disabled} />
  </label>
);

export function FinancialPanel({
  orderId,
  subtotal,
  shipping,
  discount,
  total,
  configured,
  fullyPaid,
}: {
  orderId: string;
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  configured: boolean;
  fullyPaid: boolean;
}) {
  const [open, setOpen] = useState<null | "amounts" | "payment">(null);
  const [amtState, amtAction, amtPending] = useActionState(updateOrderAmounts, {} as ActionState);
  const [payState, payAction, payPending] = useActionState(recordManualPayment, {} as ActionState);

  function toggle(k: "amounts" | "payment") {
    setOpen((o) => (o === k ? null : k));
  }

  function submitAmounts(fd: FormData): void {
    const out = new FormData();
    out.set("orderId", orderId);
    out.set("subtotal", String(toPaise(fd, "subtotal")));
    out.set("shipping", String(toPaise(fd, "shipping")));
    out.set("discount", String(toPaise(fd, "discount")));
    out.set("total", String(toPaise(fd, "total")));
    void amtAction(out);
  }

  function submitPayment(fd: FormData): void {
    const out = new FormData();
    for (const [k, v] of fd.entries()) out.append(k, v);
    out.set("amount", String(toPaise(fd, "amount")));
    void payAction(out);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <div className="admin-actions">
        {!configured ? (
          <button type="button" className="btn-admin primary" onClick={() => toggle("amounts")}>
            {open === "amounts" ? "Close form" : "Set amount"}
          </button>
        ) : (
          <>
            {!fullyPaid && (
              <button type="button" className="btn-admin primary" onClick={() => toggle("payment")}>
                {open === "payment" ? "Close form" : "Record payment"}
              </button>
            )}
            <button type="button" className="btn-admin" onClick={() => toggle("amounts")}>
              {open === "amounts" ? "Close form" : "Edit amounts"}
            </button>
            {fullyPaid && (
              <button type="button" className="btn-admin" onClick={() => toggle("payment")}>
                {open === "payment" ? "Close form" : "Record payment"}
              </button>
            )}
          </>
        )}
      </div>

      {open === "amounts" && (
        <div style={{ width: "100%", maxWidth: 560 }}>
          <Toast state={amtState} okLabel="Amounts saved" />
          <form action={submitAmounts}>
            <input type="hidden" name="orderId" value={orderId} />
            <div className="admin-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              <Field name="subtotal" label="Subtotal (₹)" defaultValue={inr(subtotal)} disabled={amtPending} />
              <Field name="shipping" label="Shipping (₹)" defaultValue={inr(shipping)} disabled={amtPending} />
              <Field name="discount" label="Discount (₹)" defaultValue={inr(discount)} disabled={amtPending} />
              <Field name="total" label="Total (₹)" defaultValue={inr(total)} disabled={amtPending} />
            </div>
            <div style={{ marginTop: 10 }}>
              <button type="submit" className="btn-admin primary" disabled={amtPending}>
                {amtPending ? <Spinner /> : "Save amounts"}
              </button>
            </div>
          </form>
        </div>
      )}

      {open === "payment" && (
        <div style={{ width: "100%", maxWidth: 560 }}>
          <Toast state={payState} okLabel="Payment recorded" />
          <form action={submitPayment} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="hidden" name="orderId" value={orderId} />
            <div className="admin-actions">
              <input name="amount" type="number" min={1} step={1} className="input" placeholder="Amount (₹)" style={{ flex: "1 1 140px" }} disabled={payPending} />
              <input name="method" className="input" placeholder="Method (cash, UPI, bank)" style={{ flex: "1 1 180px" }} disabled={payPending} />
              <button type="submit" className="btn-admin primary" disabled={payPending}>
                {payPending ? <Spinner /> : "Record payment"}
              </button>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: "var(--t2)" }}>
              <input type="checkbox" name="markPaid" value="1" disabled={payPending} />
              Mark order fully paid regardless of total
            </label>
          </form>
        </div>
      )}
    </div>
  );
}