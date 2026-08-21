"use client";

import { useState } from "react";
import Link from "next/link";
import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient();

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setMessage("");
    try {
      const res = await authClient.$fetch("/request-password-reset", {
        method: "POST",
        body: { email, redirectTo: "/reset-password" },
      });
      if (res.error) {
        setStatus("error");
        setMessage("Could not send reset email. Please try again.");
      } else {
        setStatus("success");
        setMessage("If an account exists, a password reset link has been sent.");
      }
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <header className="auth-header">
          <Link href="/" className="auth-logo" aria-label="KeebForge Home">
            <span className="auth-logo-text">
              <span>KeebForge</span>
              <span className="logo-dot">.</span>
              <span>in</span>
            </span>
          </Link>
          <h1 className="auth-title">Reset password</h1>
          <p className="auth-subtitle">Enter your email and we&apos;ll send you a reset link</p>
        </header>

        <form onSubmit={onSubmit} className="auth-form">
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
                Please wait…
              </>
            ) : (
              "Send reset link"
            )}
          </button>

          <button
            type="button"
            className="btn-ghost btn-auth-switch"
            disabled={status === "loading"}
            onClick={() => window.history.back()}
          >
            Back to sign in
          </button>
        </form>

        <p className="auth-terms">
          By continuing, you agree to our{" "}
          <Link href="/terms" className="auth-terms-link">Terms & Conditions</Link>
        </p>
      </div>
    </main>
  );
}