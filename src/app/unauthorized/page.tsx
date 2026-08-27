import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Access Denied | KeebForge",
  robots: { index: false, follow: false },
};

export default function Unauthorized() {
  return (
    <main className="pt-[calc(var(--nav-h)+80px)] pb-24">
      <div className="wrap text-center">
        <div className="cta-wrap mx-auto">
          <span className="cta-tag">403 // Access Denied</span>
          <h1 className="cta-title">
            You don&apos;t have
            <br />
            permission for this.
          </h1>
          <p className="cta-desc">
            This area is restricted to KeebForge administrators. If you believe this is a mistake,
            contact a KeebForge administrator.
          </p>
          <div className="flex gap-3.5 justify-center flex-wrap">
            <Link href="/" className="btn-prime btn-prime-lg">
              Back to KeebForge
            </Link>
            <Link href="/auth/login" className="btn-ghost">
              Sign in with another account
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
