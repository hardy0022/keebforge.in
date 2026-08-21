"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
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
    <div className="account-profile">
      <section className="account-section">
        <header className="account-section-header">
          <h2 className="account-section-title">Profile</h2>
          <p className="account-section-desc">Manage your personal information</p>
        </header>

        <form onSubmit={onSubmit} className="account-form">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div className="form-row">
              <label htmlFor="firstName">First Name</label>
              <input
                id="firstName"
                type="text"
                required
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
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={status === "loading"}
                placeholder="Doe"
              />
            </div>
          </div>

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
              placeholder="+91 98765 43210"
            />
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

          <button type="submit" className="btn-form-submit" disabled={status === "loading"}>
            {status === "loading" ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Saving…
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </form>
      </section>

      <section className="account-section">
        <header className="account-section-header">
          <h2 className="account-section-title">Account Security</h2>
          <p className="account-section-desc">Manage your password and sign-in methods</p>
        </header>

        <div className="account-security">
          <div className="account-security-item">
            <div>
              <h3>Change Password</h3>
              <p>Update your password to keep your account secure</p>
            </div>
            <button type="button" className="btn-ghost" onClick={() => router.push("/change-password")}>
              Change
            </button>
          </div>

          <div className="account-security-item">
            <div>
              <h3>Connected Accounts</h3>
              <p>Manage Google, Discord, and other sign-in methods</p>
            </div>
            <button type="button" className="btn-ghost" onClick={() => router.push("/account/connections")}>
              Manage
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}