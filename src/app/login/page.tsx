import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentAuth, isAdminRole } from "@/lib/auth";
import { SignInForm } from "@/components/auth/SignInForm";

export const metadata: Metadata = {
  title: "Sign in | KeebForge",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  const { user, profile } = await getCurrentAuth();
  if (user) redirect(isAdminRole(profile!.role) ? "/admin" : "/");

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
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to your KeebForge account</p>
        </header>

        <SignInForm />

        <p className="auth-terms">
          By continuing, you agree to our{" "}
          <Link href="/terms" className="auth-terms-link">Terms & Conditions</Link>
        </p>
      </div>
    </main>
  );
}