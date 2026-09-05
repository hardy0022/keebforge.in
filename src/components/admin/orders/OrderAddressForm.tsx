"use client";

import { useActionState } from "react";
import { updateOrderAddress, type ActionState } from "@/app/admin/actions/orders";

const Spinner = ({ light = false }: { light?: boolean }) => <span className={`spinner ${light ? "light" : ""}`} aria-hidden />;

export function OrderAddressForm({
  orderId,
  address,
}: {
  orderId: string;
  address: {
    streetAddress: string;
    apartment: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone: string | null;
    label: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState(updateOrderAddress, {});
  const success = state.ok === true;
  const errMsg = state.error || (state.ok === false ? "Something went wrong." : "");

  return (
    <div className="admin-card">
      <h3>{address.streetAddress ? "Edit shipping address" : "Add shipping address"}</h3>
      {(success || errMsg) && (
        <div className={`kf-toast ${success ? "ok" : "err"}`} role={success ? "status" : "alert"}>
          {success ? "✓ Address saved" : `✕ ${errMsg}`}
        </div>
      )}
      <form action={formAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="admin-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input name="label" className="input" placeholder="Label (e.g. Delivery)" defaultValue={address.label ?? ""} disabled={pending} />
            <input name="phone" className="input" placeholder="Phone" defaultValue={address.phone ?? ""} disabled={pending} />
          </div>
          <input name="streetAddress" className="input" placeholder="Street address *" defaultValue={address.streetAddress} disabled={pending} />
          <input name="apartment" className="input" placeholder="Apartment / unit (optional)" defaultValue={address.apartment ?? ""} disabled={pending} />
          <div className="admin-grid" style={{ gridTemplateColumns: "2fr 2fr 1fr", gap: 10 }}>
            <input name="city" className="input" placeholder="City *" defaultValue={address.city} disabled={pending} />
            <input name="state" className="input" placeholder="State *" defaultValue={address.state} disabled={pending} />
            <input name="postalCode" className="input" placeholder="PIN *" defaultValue={address.postalCode} disabled={pending} />
          </div>
          <input name="country" className="input" placeholder="Country" defaultValue={address.country} disabled={pending} />
          <div>
            <button type="submit" className="btn-admin primary" disabled={pending}>
              {pending ? <Spinner /> : "Save address"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
