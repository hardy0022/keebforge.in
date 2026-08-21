"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient();

const PROVIDERS = [
  {
    id: "google",
    label: "Google",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.2 3.7-8.6Z" />
        <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5l-3.8 3c1.9 3.8 5.8 6.6 10.7 6.6Z" />
        <path fill="#FBBC05" d="M5.1 14.4a7.2 7.2 0 0 1-.4-2.4c0-.8.1-1.6.4-2.4L1.3 6.6A12 12 0 0 0 0 12c0 1.9.5 3.8 1.3 5.4l3.8-3Z" />
        <path fill="#EA4335" d="M12 4.6c2.3 0 3.8 1 4.7 1.8l3.4-3.3C17.9 1.2 15.2 0 12 0 7.1 0 3.2 2.8 1.3 6.6l3.8 3c1-2.9 3.7-5 6.9-5Z" />
      </svg>
    ),
  },
  {
    id: "discord",
    label: "Discord",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#5865F2" aria-hidden="true">
        <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.2a18.3 18.3 0 0 0-5.6 0L8.6 3a19.8 19.8 0 0 0-4.9 1.4A20.4 20.4 0 0 0 .2 18.1a19.9 19.9 0 0 0 6 3l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12 0l.5.4a12.9 12.9 0 0 1-2 1l1.3 2a19.9 19.9 0 0 0 6-3 20.3 20.3 0 0 0-3.9-13.7ZM8.6 15.3c-1.2 0-2.1-1-2.1-2.3s.9-2.3 2.1-2.3 2.1 1 2.1 2.3-.9 2.3-2.1 2.3Zm6.8 0c-1.2 0-2.1-1-2.1-2.3s.9-2.3 2.1-2.3 2.1 1 2.1 2.3-.9 2.3-2.1 2.3Z" />
      </svg>
    ),
  },
];

async function homeForRole(): Promise<string> {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  if (res.ok) {
    const me = await res.json();
    if (me.role === "ADMIN" || me.role === "STAFF") return "/admin";
  }
  return "/";
}

export function SignInForm({ redirectTo = "/" }: { redirectTo?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    const home = await homeForRole();
    router.push(home === "/" ? redirectTo : home);
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res =
      mode === "signin"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({
            name: email.split("@")[0],
            email,
            password,
          });
    if (res.error) {
      setError(mode === "signin" ? "Invalid email or password." : "Could not create account. Try again or sign in.");
      setBusy(false);
      return;
    }
    await go();
  }

  async function social(provider: "google" | "discord") {
    setError(null);
    setBusy(true);
    const res = await authClient.signIn.social({ provider, callbackURL: "/auth/callback" });
    if (res.error) setError("That sign-in isn't configured yet. Try email instead.");
    setBusy(false);
  }

  const enabled = PROVIDERS.filter((p) => p.id === "google" || p.id === "discord");

  return (
    <div className="auth-form">
      <div className="auth-social">
        {enabled.map((p) => (
          <button
            key={p.id}
            type="button"
            className="btn-social"
            onClick={() => social(p.id as "google" | "discord")}
            disabled={busy}
          >
            {p.icon}
            <span>Continue with {p.label}</span>
          </button>
        ))}
      </div>

      <div className="or-divider">
        <span>OR CONTINUE WITH EMAIL</span>
      </div>

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
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              placeholder={mode === "signin" ? "Enter your password" : "Create a password"}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
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
              Please wait…
            </>
          ) : mode === "signin" ? (
            "Sign in"
          ) : (
            "Create account & sign in"
          )}
        </button>

        <div className="auth-links">
          <Link href="/forgot-password" className="auth-link">
            Forgot password?
          </Link>
        </div>

        <button
          type="button"
          className="btn-ghost btn-auth-switch"
          disabled={busy}
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "New to KeebForge? Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}