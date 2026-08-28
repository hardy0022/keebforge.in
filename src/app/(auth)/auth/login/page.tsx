import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentAuth } from "@/lib/auth";
import { getAdminContext } from "@/lib/auth/admin";
import { SignInForm } from "@/components/auth/SignInForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "Sign in | KeebForge",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { user } = await getCurrentAuth();
  if (user) redirect((await getAdminContext()) ? "/admin" : "/");

  const sp = await searchParams;
  // Only allow internal redirects — never open redirects.
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : undefined;

  return (
    <AuthShell
      socialTitle="Sign in faster"
      switchPrompt="New to KeebForge?"
      switchLabel="Create an account"
      switchHref="/auth/register"
      legal={
        <>
          By continuing, you agree to our{" "}
          <Link href="/terms" className="auth-terms-link">
            Terms &amp; Conditions
          </Link>
        </>
      }
    >
      <header className="auth-header">
        <Link href="/" className="auth-logo" aria-label="KeebForge Home">
          <span className="auth-logo-text">
            <span>KeebForge</span>
            <span className="logo-dot">.</span>
            <span>in</span>
          </span>
        </Link>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to your KeebForge account</p>
      </header>

      <SignInForm next={next} />

    </AuthShell>
  );
}
