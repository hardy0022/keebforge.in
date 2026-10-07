"use client";

import { useState } from "react";
import { EMAIL_INPUT } from "@/lib/utils/email";
import {
  resendVerificationEmail,
  type ResendVerificationOutcome,
} from "@/lib/auth/resend-verification";

type Status = "idle" | "loading" | ResendVerificationOutcome["status"];

/**
 * "Send the verification link again" — shown on /auth/error for
 * `account_not_linked`.
 *
 * The address is asked for rather than carried in the error URL: the OAuth
 * callback never has it, and putting it in a query string would leak PII into
 * browser history and referrers.
 *
 * Outcomes are the two fixed strings from resend-verification.ts, so neither
 * Resend's error text nor the existence of an account can reach this component.
 */
export function ResendVerificationForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setMessage("");
    const outcome = await resendVerificationEmail(email);
    setStatus(outcome.status);
    setMessage(outcome.message);
  }

  return (
    <form onSubmit={onSubmit} className="auth-form">
      <div className="form-row">
        <label htmlFor="resend-verification-email">Email</label>
        <input
          id="resend-verification-email"
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

      <button
        type="submit"
        className="btn-form-submit"
        disabled={status === "loading"}
      >
        {status === "loading" ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Please wait…
          </>
        ) : (
          "Send verification email"
        )}
      </button>
    </form>
  );
}
