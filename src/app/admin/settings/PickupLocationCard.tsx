"use client";

import { ActionForm, Spinner } from "@/components/admin/ActionForm";
import { saveDelhiveryPickup } from "@/app/admin/actions/settings";

const Field = ({
  name,
  label,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
}) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.78rem", color: "var(--t3)" }}>
    {label}
    <input name={name} defaultValue={defaultValue} placeholder={placeholder} className="input" />
  </label>
);

export function PickupLocationCard({ initial }: { initial: Record<string, string> | null }) {
  const p = initial ?? {};
  return (
    <div className="admin-card">
      <h3 style={{ marginBottom: 4 }}>Delhivery Pickup Location</h3>
      <p className="muted" style={{ fontSize: "0.8rem", marginBottom: 14, lineHeight: 1.5 }}>
        The warehouse from which shipments are picked up. The name is registered with Delhivery on save, so the
        &ldquo;Create shipment (Delhivery)&rdquo; action can use it. Return address defaults to this address.
      </p>
      <ActionForm action={saveDelhiveryPickup} toastLabel="Pickup location">
        {(pending) => (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
              <Field name="name" label="Pickup name (warehouse)" defaultValue={p.name ?? ""} placeholder="e.g. KeebForge HQ" />
              <Field name="address" label="Address" defaultValue={p.address ?? ""} placeholder="Full street address" />
              <Field name="city" label="City" defaultValue={p.city ?? ""} placeholder="City" />
              <Field name="pin" label="Pincode" defaultValue={p.pin ?? ""} placeholder="6-digit pincode" />
              <Field name="state" label="State" defaultValue={p.state ?? ""} placeholder="State" />
              <Field name="country" label="Country" defaultValue={p.country ?? "India"} />
              <Field name="phone" label="Phone" defaultValue={p.phone ?? ""} placeholder="10-digit phone" />
              <Field name="email" label="Email (optional)" defaultValue={p.email ?? ""} placeholder="Email" />
              <Field name="registeredName" label="Registered account name (optional)" defaultValue={p.registeredName ?? ""} placeholder="Defaults to pickup name" />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
              <button type="submit" className="btn-admin primary" disabled={pending}>
                {pending ? <Spinner /> : "Save & sync with Delhivery"}
              </button>
              {p.name && (
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  Current: {p.name} — {p.city} {p.pin}
                </span>
              )}
            </div>
          </>
        )}
      </ActionForm>
    </div>
  );
}