import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign-in error | KeebForge",
  robots: { index: false, follow: false },
};

/** Friendly copy per whitelisted error code. Raw codes/descriptions are never rendered. */
const MESSAGES: Record<string, { title: string; detail: string }> = {
  access_denied: {
    title: "Sign-in was cancelled",
    detail: "You cancelled the sign-in, or the provider denied access. You can try again.",
  },
  state_mismatch: {
    title: "Sign-in could not be verified",
    detail: "The sign-in request expired or is no longer valid. Please start again.",
  },
  state_invalid: {
    title: "Sign-in could not be verified",
    detail: "The sign-in request expired or is no longer valid. Please start again.",
  },
};

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  // Whitelist only — unknown/missing codes fall through to the generic message.
  const msg =
    (error && error in MESSAGES ? MESSAGES[error] : null) ?? {
      title: "Something went wrong",
      detail: "We couldn't complete your sign-in. Please try again or return to KeebForge.",
    };

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
          <h1 className="auth-title">{msg.title}</h1>
          <p className="auth-subtitle">{msg.detail}</p>
        </header>

        <div className="flex flex-col gap-3" role="alert">
          <Link href="/auth/login" className="btn-prime w-full text-center">
            Try Again
          </Link>
          <Link href="/" className="btn-ghost w-full text-center">
            Back to KeebForge
          </Link>
        </div>
      </div>
    </main>
  );
}
