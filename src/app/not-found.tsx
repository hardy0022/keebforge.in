import type { Metadata } from "next";
import Link from "next/link";

// Explicit 404 metadata: strict noindex, neutral title, and NO canonical
// (Next's not-found already emits a 404 status; without this the root layout
// metadata bleeds the homepage title + homepage canonical onto 404 pages).
export const metadata: Metadata = {
  title: "Page not found | KeebForge.in",
  description: "The page you're looking for doesn't exist or has moved.",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function NotFound() {
  return (
    <main className="pt-[calc(var(--nav-h)+80px)] pb-24">
      <div className="wrap text-center">
        <div className="cta-wrap mx-auto">
          <span className="cta-tag">404 // Not Found</span>
          <h1 className="cta-title">
            This key
            <br />
            doesn&apos;t register.
          </h1>
          <p className="cta-desc">
            The page you&apos;re looking for doesn&apos;t exist or has moved.
            Old KeebForge URLs automatically redirect to their new locations —
            try the homepage or browse the services.
          </p>
          <div className="flex gap-3.5 justify-center flex-wrap">
            <Link href="/" className="btn-prime btn-prime-lg">
              Back to Home
            </Link>
            <Link href="/mods" className="btn-ghost">
              View Mods
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
