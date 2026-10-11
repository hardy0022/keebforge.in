"use client";

import { useState, useEffect } from "react";
import { AddressBook } from "@/components/account/AddressBook";
import { PHONE_INPUT } from "@/lib/utils/phone";
import { EMAIL_INPUT } from "@/lib/utils/email";

export default function ProfilePage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await fetch("/api/account/profile");
        if (res.ok) {
          const data = await res.json();
          const nameParts = (data.name ?? "").trim().split(/\s+/);
          setFirstName(nameParts[0] ?? "");
          setLastName(nameParts.slice(1).join(" ") ?? "");
          setEmail(data.email ?? "");
          setPhone(data.phone ?? "");
        }
      } catch {
        // ignore
      }
    }
    loadProfile();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setMessage("");

    const name = `${firstName.trim()} ${lastName.trim()}`.trim();

    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone }),
      });

      if (res.ok) {
        setStatus("success");
        setMessage("Profile updated successfully.");
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        const data = await res.json();
        setStatus("error");
        setMessage(data.error ?? "Failed to update profile. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <div className="account-stack">
      <section className="account-section account-section--details">
        <header className="account-section-header">
          <div>
            <span className="account-kicker">{"// Personal Information"}</span>
            <h2 className="account-section-title">Your Details</h2>
            <p className="account-section-desc">
              Used on your orders, invoices and shipping labels
            </p>
          </div>
          {/* Lives in the header, so it submits via the form id rather than
              nesting. Implicit submission (Enter in a field) still works
              because this button is the form's default button. */}
          <button
            type="submit"
            form="profile-details-form"
            className="account-action-btn"
            disabled={status === "loading"}
          >
            {status === "loading" ? (
              <>
                <span className="spinner light" aria-hidden="true" />
                Saving…
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </header>

        <form
          id="profile-details-form"
          onSubmit={onSubmit}
          className="account-form account-panel"
        >
          <div className="account-field-grid">
            <div className="form-row">
              <label htmlFor="firstName">First Name</label>
              <input
                id="firstName"
                type="text"
                required
                maxLength={80}
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={status === "loading"}
                placeholder="John"
              />
            </div>

            <div className="form-row">
              <label htmlFor="lastName">Last Name</label>
              <input
                id="lastName"
                type="text"
                maxLength={80}
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={status === "loading"}
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="account-field-grid">
            <div className="form-row">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "loading"}
                placeholder="you@example.com"
                {...EMAIL_INPUT}
              />
            </div>

            <div className="form-row">
              <label htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={status === "loading"}
                placeholder="9876543210"
                {...PHONE_INPUT}
              />
            </div>
          </div>

          {status === "success" && (
            <p className="auth-success" role="status">
              {message}
            </p>
          )}
          {status === "error" && (
            <p className="auth-error" role="alert">
              {message}
            </p>
          )}
        </form>
      </section>

      <AddressBook />
    </div>
  );
}
