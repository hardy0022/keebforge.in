"use client";

/**
 * Shared saved-address card selector (radio cards + "Use a different address").
 * Used by /mods Step 04 and /checkout so both pages stay visually identical.
 * Manual address fields are rendered by the host page when selectedId === "".
 */

export interface SavedAddressOption {
  id: string;
  label: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  streetAddress: string;
  apartment?: string | null;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
}

export function AddressPicker({
  addresses,
  selectedId,
  onSelect,
}: {
  addresses: SavedAddressOption[];
  /** Selected address id; "" = manual entry; null = nothing selected yet. */
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="ri-address-list" style={{ marginTop: 0 }}>
      {[...addresses, null].map((a) =>
        a ? (
          <label key={a.id} className={`ri-address${selectedId === a.id ? " selected" : ""}`}>
            <input
              type="radio"
              name="address-picker"
              checked={selectedId === a.id}
              onChange={() => onSelect(a.id)}
            />
            <span>
              <strong>{a.label}{a.isDefault ? " · Default" : ""}</strong>
              {a.streetAddress}, {a.city}, {a.state} {a.postalCode}
            </span>
          </label>
        ) : (
          <label key="new" className={`ri-address${selectedId === "" ? " selected" : ""}`}>
            <input
              type="radio"
              name="address-picker"
              checked={selectedId === ""}
              onChange={() => onSelect("")}
            />
            <span><strong>Use a different address</strong></span>
          </label>
        )
      )}
    </div>
  );
}
