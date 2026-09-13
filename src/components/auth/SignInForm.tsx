"use client";

import { authClient } from "@/lib/auth/auth-client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PasswordField } from "@/components/ui/PasswordField";

async function homeForRole(): Promise<string> {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  if (res.ok) {
    const me = await res.json();
    if (me.role === "ADMIN" || me.role === "STAFF" || me.role === "DEVELOPER")
      return "/admin";
  }
  return "/";
}

export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        <PasswordField
          id="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          disabled={busy}
          placeholder="Enter your password"
        />
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
