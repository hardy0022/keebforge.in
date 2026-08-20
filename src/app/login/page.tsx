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
    <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: "24px" }}>
      <div style={{ width: "min(100%, 380px)" }}>
        <div className="admin-card" style={{ padding: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <span style={{ fontSize: "1.4rem" }}>⌨️</span>
            <div>
              <div style={{ fontFamily: "var(--ff-display)", fontWeight: 700, letterSpacing: "-0.02em" }}>
                KeebForge
              </div>
              <div className="muted">Sign in or create an account</div>
            </div>
          </div>
          <div style={{ height: 1, background: "var(--bdr)", margin: "16px 0" }} />
          <SignInForm />
          <p className="muted" style={{ fontSize: "0.75rem", textAlign: "center", marginTop: 14 }}>
            By continuing you agree to our <Link href="/terms" style={{ color: "var(--acc)" }}>terms</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}