"use client";

import { authClient } from "@/lib/auth/auth-client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

async function homeForRole(): Promise<string> {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  if (res.ok) {
    const me = await res.json();
    if (me.role === "ADMIN" || me.role === "STAFF") return "/admin";
  }
  return "/";
}

export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await authClient.signIn.email({ email, password });
    if (res.error) {
      setError("Email or password is incorrect.");
      setBusy(false);
      return;
    }
    router.push(next ?? (await homeForRole()));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="auth-form-fields">
        <div className="form-row">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            placeholder="you@example.com"
          />
        </div>

        <div className="form-row">
          <label htmlFor="password">Password</label>
          <div className="password-wrapper">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              placeholder="Enter your password"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
          <div className="auth-links">
            <Link href="/auth/forgot-password" className="auth-link">
              Forgot password?
            </Link>
          </div>
        </div>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-form-submit" disabled={busy}>
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            <>
              Sign in <span aria-hidden="true">→</span>
            </>
          )}
        </button>
      </form>
  );
}

/** Shared eye / eye-off icon for password visibility toggles. */
export function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
