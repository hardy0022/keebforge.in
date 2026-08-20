import Link from "next/link";

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
            The page you&apos;re looking for doesn&apos;t exist or has moved. Old KeebForge URLs automatically redirect to their
            new locations — try the homepage or browse the services.
          </p>
          <div className="flex gap-3.5 justify-center flex-wrap">
            <Link href="/" className="btn-prime btn-prime-lg">
              Back to Home
            </Link>
            <Link href="/services" className="btn-ghost">
              View Services
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}