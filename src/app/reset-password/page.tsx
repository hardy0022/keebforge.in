"use client";

import { authClient } from "@/lib/auth/auth-client";
import { PASSWORD_RULES } from "@/lib/password";
import { EyeIcon } from "@/components/auth/SignInForm";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function ResetPasswordBody() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get("token");
  const invalid = sp.get("error") === "INVALID_TOKEN" || !token;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requirements = useMemo(
    () => [
      ...PASSWORD_RULES.map((r) => ({
        label: r.label,
        met: r.test(password),
      })),
      {
        label: "Passwords match",
        met: confirm.length > 0 && password === confirm,
      },
    ],
    [password, confirm],
  );
  const canSubmit = requirements.every((r) => r.met) && !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authClient.$fetch("/reset-password", {
        method: "POST",
        body: { newPassword: password, token },
      });
      if (res.error) {
        const code = (res.error as { code?: string }).code;
        setError(
          code === "INVALID_TOKEN"
            ? "This reset link is invalid or has already been used. Please request a new one."
            : "Unable to reset your password. Please try again.",
        );
        setBusy(false);
        return;
      }
      router.push("/auth/login");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <>
        <p className="auth-error" role="alert">
          The password reset link is invalid or has expired. Please request a
          new one.
        </p>
        <Link
          href="/auth/forgot-password"
          className="btn-form-submit"
          style={{ display: "block", textAlign: "center" }}
        >
          Request a new link
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={onSubmit} className="auth-form">
      <div className="form-row">
        <label htmlFor="reset-password">New password</label>
        <div className="password-wrapper">
          <input
            id="reset-password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            placeholder="New password"
            aria-describedby="pw-requirements"
            aria-invalid={
              password.length > 0 && !requirements.every((r) => r.met)
            }
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

        <p className="req-title" id="pw-requirements-label">
          Password requirements
        </p>
        <ul
          id="pw-requirements"
          className="req-list"
          aria-labelledby="pw-requirements-label"
        >
          {requirements.map((r) => (
            <li key={r.label} className={r.met ? "met" : ""}>
              <span className="req-mark" aria-hidden="true">
                {r.met ? "✓" : "○"}
              </span>
              {r.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="form-row">
        <label htmlFor="confirm-password">Confirm password</label>
        <div className="password-wrapper">
          <input
            id="confirm-password"
            type={showConfirm ? "text" : "password"}
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={busy}
            placeholder="Confirm new password"
            aria-invalid={confirm.length > 0 && password !== confirm}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowConfirm((v) => !v)}
            aria-label={showConfirm ? "Hide password" : "Show password"}
            aria-pressed={showConfirm}
          >
            <EyeIcon open={showConfirm} />
          </button>
        </div>
        {confirm.length > 0 && password !== confirm && (
          <p className="field-note err">Passwords do not match.</p>
        )}
      </div>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn-form-submit" disabled={!canSubmit}>
        {busy ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Resetting…
          </>
        ) : (
          <>
            Reset password <span aria-hidden="true">→</span>
          </>
        )}
      </button>

      <button
        type="button"
        className="btn-ghost btn-auth-switch"
        disabled={busy}
        onClick={() => router.push("/auth/login")}
      >
        Back to sign in
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
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
          <h1 className="auth-title">Choose a new password</h1>
          <p className="auth-subtitle">
            Pick a strong password you haven&apos;t used anywhere else.
          </p>
        </header>
        <Suspense fallback={null}>
          <ResetPasswordBody />
        </Suspense>
      </div>
    </main>
  );
}
