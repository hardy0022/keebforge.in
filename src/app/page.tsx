import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "KeebForge — Website under maintenance",
  description: "KeebForge is under maintenance. Shop for keyboards, switches and services at shop.keebforge.in.",
  robots: { index: true, follow: true },
};

const SHOP_URL = "https://shop.keebforge.in/";

export default function HomePage() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100svh", padding: "24px", textAlign: "center" }}>
      <meta httpEquiv="refresh" content={`3;url=${SHOP_URL}`} />
      <div style={{ maxWidth: 520, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <span style={{ fontSize: "2.6rem" }} aria-hidden="true">🛠️</span>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          Website under maintenance
        </h1>
        <p style={{ color: "var(--t2)", lineHeight: 1.65 }}>
          We&apos;re giving the site a tune-up. Our shop is still open — keep browsing keyboards, switches and services over at
          the store.
        </p>
        <Link
          href={SHOP_URL}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--ff-display)",
            fontWeight: 600,
            fontSize: "0.85rem",
            letterSpacing: "0.03em",
            color: "#060608",
            background: "var(--acc)",
            padding: "13px 28px",
            borderRadius: 99,
          }}
        >
          Continue to shop ↗
        </Link>
        <p className="muted" style={{ fontSize: "0.72rem", marginTop: 8 }}>
          Redirecting you in a moment…
        </p>
      </div>
    </main>
  );
}