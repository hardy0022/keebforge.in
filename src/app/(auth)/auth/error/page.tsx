import type { Metadata } from "next";
import Link from "next/link";
import { resolveAuthErrorMessage } from "@/lib/auth/auth-error";
import { ResendVerificationForm } from "@/components/auth/ResendVerificationForm";

export const metadata: Metadata = {
  title: "Sign-in error | KeebForge",
  robots: { index: false, follow: false },
};

/**
 * Copy lives in src/lib/auth/auth-error.ts alongside the proxy allow list, so
 * a code cannot reach this page without having copy written for it.
 *
 * `account_not_linked` is the one code that is *recoverable* from here: the
 * signer has an unverified local account and just tried to use Google. The
 * resend action uses Better Auth's own endpoint (rate limited, non-enumerating)
 * — see src/lib/auth/resend-verification.ts. Nothing is linked and nothing is
 * auto-verified by this page.
 */
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const msg = resolveAuthErrorMessage(error);
  const canResend = error === "account_not_linked";

  return (
    <main className="auth-page">
      <div className="auth-card">
        <header className="auth-header">
          <Link href="/" className="auth-logo">
            <span className="auth-logo-text">
              <span>KeebForge</span>
              <span className="logo-dot">.</span>
              <span>in</span>
            </span>
          </Link>
          <h1 className="auth-title">{msg.title}</h1>
          <p className="auth-subtitle">{msg.detail}</p>
        </header>

        {canResend && <ResendVerificationForm />}

        <div className="flex flex-col gap-3" role="alert">
          <Link href="/auth/login" className="btn-prime w-full text-center">
            {canResend ? "Continue with email and password" : "Try Again"}
          </Link>
          <Link href="/" className="btn-ghost w-full text-center">
            Back to KeebForge
          </Link>
        </div>
      </div>
    </main>
  );
}
