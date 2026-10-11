"use client";

import { useState, useEffect, useCallback } from "react";
import { StateSelect } from "@/components/ui/StateSelect";
import { PinCodeInput } from "@/components/ui/PinCodeInput";
import { AccountModal } from "@/components/ui/AccountModal";
import { PHONE_INPUT } from "@/lib/utils/phone";
import { EMAIL_INPUT } from "@/lib/utils/email";

interface Address {
  id: string;
  label: string;
  name: string | null;
  email: string | null;
  streetAddress: string;
  apartment: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string | null;
  isDefault: boolean;
}

const onlyDigits = (v: string) => v.replace(/\D/g, "").slice(0, 10);
const EMPTY_FORM = {
  label: "Home",
  firstName: "",
  lastName: "",
  email: "",
  streetAddress: "",
  apartment: "",
  city: "",
  state: "",
  postalCode: "",
  country: "India",
  phone: "",
  isDefault: false,
};

export function AddressBook() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [formData, setFormData] = useState(EMPTY_FORM);

  const loadAddresses = useCallback(async () => {
    try {
      const res = await fetch("/api/account/addresses");
      if (res.ok) {
        const data = await res.json();
        setAddresses(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAddresses();
  }, [loadAddresses]);

  function openAddModal() {
    setEditingAddress(null);
    setFormData({ ...EMPTY_FORM, isDefault: addresses.length === 0 });
    setShowModal(true);
  }

  function openEditModal(address: Address) {
    setEditingAddress(address);
    setFormData(() => {
      const parts = (address.name ?? "").trim().split(/\s+/);
      return {
        label: address.label,
        firstName: parts[0] ?? "",
        lastName: parts.slice(1).join(" "),
        email: address.email ?? "",
        streetAddress: address.streetAddress,
        apartment: address.apartment ?? "",
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country,
        phone: onlyDigits(address.phone ?? ""),
        isDefault: address.isDefault,
      };
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingAddress(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (formData.phone && !/^\d{10}$/.test(formData.phone)) return;
    const url = editingAddress
      ? `/api/account/addresses/${editingAddress.id}`
      : "/api/account/addresses";
    const method = editingAddress ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        closeModal();
        loadAddresses();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to save address.");
      }
    } catch {
      // ignore
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this address?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/account/addresses/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        loadAddresses();
      }
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSetDefault(id: string) {
    try {
      const res = await fetch(`/api/account/addresses/${id}/default`, {
        method: "POST",
      });
      if (res.ok) {
        loadAddresses();
      }
    } catch {
      // ignore
    }
  }

  if (loading) {
    return <div className="account-loading">Loading addresses…</div>;
  }

  return (
    <section className="account-section">
      <header className="account-section-header">
        <div>
          <span className="account-kicker">{"// Saved Addresses"}</span>
          <h2 className="account-section-title">Shipping Addresses</h2>
          <p className="account-section-desc">
            Where your builds and repairs get shipped
          </p>
        </div>
        <button
          type="button"
          className="account-action-btn"
          onClick={openAddModal}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add New Address
        </button>
      </header>

      {addresses.length === 0 ? (
        <div className="account-empty account-empty--plain account-empty--center">
          <h3 className="account-empty-title">No saved addresses yet</h3>
          <p className="account-empty-sub">
            Add an address to make checkout and workshop shipments faster.
          </p>
        </div>
      ) : (
        <div className="account-addresses-grid">
          {addresses.map((address) => (
            <div key={address.id} className="account-address-card">
              <div className="account-address-header">
                <span className="account-address-label">{address.label}</span>
                {address.isDefault && (
                  <span className="account-address-default">Default</span>
                )}
              </div>

              <address className="account-address-details">
                {address.name && (
                  <div className="account-address-name">{address.name}</div>
                )}
                <div>{address.streetAddress}</div>
                {address.apartment && <div>{address.apartment}</div>}
                <div>
                  {address.city}, {address.state} {address.postalCode}
                </div>
                <div>{address.country}</div>
              </address>

              {(address.email || address.phone) && (
                <div className="account-address-contact">
                  {address.email && (
                    <div>
                      <span>Email</span>
                      {address.email}
                    </div>
                  )}
                  {address.phone && (
                    <div>
                      <span>Phone</span>
                      {address.phone}
                    </div>
                  )}
                </div>
              )}

              <div className="account-address-actions">
                {address.isDefault || !addresses.some((a) => a.isDefault) ? (
                  <span className="account-address-default-text">
                    Default address
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => handleSetDefault(address.id)}
                  >
                    Set as default
                  </button>
                )}
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => openEditModal(address)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm btn-danger"
                  onClick={() => handleDelete(address.id)}
                  disabled={deletingId === address.id}
                >
                  {deletingId === address.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <AccountModal
          kicker={"// Shipping Address"}
          title={editingAddress ? "Edit Address" : "Add Address"}
          subtitle={
            editingAddress
              ? "Update the address used for delivery."
              : "Save a new delivery address to your account."
          }
          className="account-modal--wide"
          titleId="address-modal-title"
          onClose={closeModal}
        >
          <form onSubmit={handleSubmit} className="account-form">
            <div className="account-form-body">
              <div className="form-row">
                <label htmlFor="label">Label</label>
                <input
                  id="label"
                  type="text"
                  required
                  value={formData.label}
                  onChange={(e) =>
                    setFormData({ ...formData, label: e.target.value })
                  }
                  placeholder="Home, Work, etc."
                />
              </div>

              <div className="account-field-grid">
                <div className="form-row">
                  <label htmlFor="addr-first-name">First Name *</label>
                  <input
                    id="addr-first-name"
                    type="text"
                    required
                    maxLength={80}
                    value={formData.firstName}
                    onChange={(e) =>
                      setFormData({ ...formData, firstName: e.target.value })
                    }
                    placeholder="Recipient's first name"
                  />
                </div>

                <div className="form-row">
                  <label htmlFor="addr-last-name">Last Name *</label>
                  <input
                    id="addr-last-name"
                    type="text"
                    required
                    maxLength={80}
                    value={formData.lastName}
                    onChange={(e) =>
                      setFormData({ ...formData, lastName: e.target.value })
                    }
                    placeholder="Recipient's last name"
                  />
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="addr-email">Email *</label>
                <input
                  id="addr-email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  placeholder="you@example.com"
                  {...EMAIL_INPUT}
                />
              </div>

              <div className="form-row">
                <label htmlFor="streetAddress">House / Flat / Building *</label>
                <input
                  id="streetAddress"
                  type="text"
                  required
                  maxLength={200}
                  value={formData.streetAddress}
                  onChange={(e) =>
                    setFormData({ ...formData, streetAddress: e.target.value })
                  }
                  placeholder="e.g. 123, ABC Apartments, MG Road"
                />
              </div>

              <div className="form-row">
                <label htmlFor="apartment">Landmark (Optional)</label>
                <input
                  id="apartment"
                  type="text"
                  maxLength={200}
                  value={formData.apartment}
                  onChange={(e) =>
                    setFormData({ ...formData, apartment: e.target.value })
                  }
                  placeholder="e.g. Near Metro Station, Opposite Park"
                />
              </div>

              <div className="account-field-grid">
                <div className="form-row">
                  <label htmlFor="city">City *</label>
                  <input
                    id="city"
                    type="text"
                    required
                    maxLength={100}
                    value={formData.city}
                    onChange={(e) =>
                      setFormData({ ...formData, city: e.target.value })
                    }
                    placeholder="e.g. Bengaluru"
                  />
                </div>

                <div className="form-row">
                  <label htmlFor="state">State *</label>
                  <StateSelect
                    id="state"
                    value={formData.state}
                    onChange={(v) => setFormData({ ...formData, state: v })}
                    required
                  />
                </div>
              </div>

              <div className="account-field-grid">
                <div className="form-row">
                  <label htmlFor="postalCode">PIN Code *</label>
                  <PinCodeInput
                    id="postalCode"
                    required
                    pattern="[0-9]{6}"
                    value={formData.postalCode}
                    onChange={(v) =>
                      setFormData({ ...formData, postalCode: v })
                    }
                    placeholder="560001"
                  />
                </div>

                <div className="form-row">
                  <label htmlFor="phone">Phone Number</label>
                  <input
                    id="phone"
                    type="tel"
                    required
                    value={formData.phone}
                    {...PHONE_INPUT}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        phone: onlyDigits(e.target.value),
                      })
                    }
                    placeholder="9998888000"
                  />
                </div>
              </div>

              <div className="form-row">
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.isDefault}
                    onChange={(e) =>
                      setFormData({ ...formData, isDefault: e.target.checked })
                    }
                  />
                  Set as default address
                </label>
              </div>
            </div>

            <div className="account-modal-actions">
              <button type="button" className="btn-ghost" onClick={closeModal}>
                Cancel
              </button>
              <button type="submit" className="btn-form-submit">
                {editingAddress ? "Save Changes →" : "Add Address →"}
              </button>
            </div>
          </form>
        </AccountModal>
      )}
    </section>
  );
}
