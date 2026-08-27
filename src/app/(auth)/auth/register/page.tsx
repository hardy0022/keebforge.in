import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentAuth } from "@/lib/auth";
import { getAdminContext } from "@/lib/auth/admin";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = {
  title: "Create account | KeebForge",
  robots: { index: false, follow: false },
};

export default async function RegisterPage() {
  const { user } = await getCurrentAuth();
  if (user) redirect((await getAdminContext()) ? "/admin" : "/");

  return (
    <AuthShell
      socialTitle="Create an account faster"
      switchPrompt="Already have an account?"
      switchLabel="Sign in"
      switchHref="/auth/login"
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
        <h1 className="auth-title">Create your account</h1>
      </header>

      <RegisterForm />
    </AuthShell>
  );
}
