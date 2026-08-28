"use client";

import { authClient } from "@/lib/auth/auth-client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon } from "./SignInForm";
import { usernameError } from "@/lib/username";
import { PASSWORD_RULES } from "@/lib/password";

export function RegisterForm({ next }: { next?: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Real availability check against the DB (debounced; never fabricated).
  const [nameCheck, setNameCheck] = useState<"idle" | "checking" | "free" | "taken">("idle");
  const latestUsername = useRef("");

  function onUsernameChange(v: string) {
    setUsername(v);
    latestUsername.current = v;
    setNameCheck("idle");
    if (usernameError(v)) return;
    setNameCheck("checking");
    window.setTimeout(async () => {
      if (latestUsername.current !== v) return; // stale — field changed since
      try {
        const res = await fetch(`/api/auth/check-username?u=${encodeURIComponent(v.trim().toLowerCase())}`);
        if (!res.ok || latestUsername.current !== v) return;
        const data = (await res.json()) as { available: boolean };
        setNameCheck(data.available ? "free" : "taken");
      } catch {
        setNameCheck("idle");
      }
    }, 350);
  }

  const requirements = useMemo(
    () => [
      ...PASSWORD_RULES.map((r) => ({ label: r.label, met: r.test(password) })),
      { label: "Passwords match", met: confirm.length > 0 && password === confirm },
    ],
    [password, confirm]
  );

  const uErr = username.length > 0 ? usernameError(username) : null;
  const allMet = requirements.every((r) => r.met);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit =
    !uErr && username.trim().length > 0 && emailValid && allMet && nameCheck !== "taken" && !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    const res = await authClient.signUp.email({
      name: username.trim(),
      email,
      password,
    });

    if (res.error) {
      setError(
        res.error.status === 422 || res.error.status === 409
          ? "An account with this email already exists. Try signing in instead."
          : "Unable to create your account right now. Please try again."
      );
      setBusy(false);
      return;
    }

    // Best-effort: claim the username on the fresh profile. Registration has
    // already succeeded — a failure here must not block or error the user.
    try {
      await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim().toLowerCase() }),
      });
    } catch {
      /* non-fatal */
    }

    router.push(next ?? "/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="auth-form-fields">
        <div className="form-row">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            required
            autoComplete="username"
            value={username}
            onChange={(e) => onUsernameChange(e.target.value)}
            disabled={busy}
            placeholder="Choose a username"
            aria-invalid={Boolean(uErr)}
            aria-describedby="username-status"
          />
          {(uErr || nameCheck !== "idle") && (
            <p id="username-status" className={nameCheck === "free" ? "field-note ok" : nameCheck === "taken" ? "field-note err" : "field-hint"}>
              {uErr ?? (nameCheck === "checking" ? "Checking availability…" : nameCheck === "free" ? "✓ Username available" : "Username already taken")}
            </p>
          )}
        </div>

        <div className="form-row">
          <label htmlFor="reg-email">Email</label>
          <input
            id="reg-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            placeholder="you@example.com"
          />
          {email.length > 0 && !emailValid && <p className="field-note err">Please enter a valid email address.</p>}
        </div>

        <div className="form-row">
          <label htmlFor="reg-password">Password</label>
          <div className="password-wrapper">
            <input
              id="reg-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              placeholder="Create a password"
              aria-describedby="pw-requirements"
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
          <ul id="pw-requirements" className="req-list" aria-labelledby="pw-requirements-label">
            {requirements.slice(0, 5).map((r) => (
              <li key={r.label} className={r.met ? "met" : ""}>
                <span className="req-mark" aria-hidden="true">{r.met ? "✓" : "○"}</span>
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
              placeholder="Confirm your password"
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
          {confirm.length > 0 && password !== confirm && <p className="field-note err">Passwords do not match.</p>}
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
              Creating account…
            </>
          ) : (
            <>
              Create account <span aria-hidden="true">→</span>
            </>
          )}
        </button>
      </form>
  );
}
