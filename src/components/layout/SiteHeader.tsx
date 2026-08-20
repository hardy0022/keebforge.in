"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient();

const LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/services", label: "Services" },
  { href: "/repair/keyboard", label: "Repair" },
  { href: "/work", label: "Work" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: session } = authClient.useSession();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <nav className={`nav${scrolled ? " scrolled" : ""}`} aria-label="Main navigation">
        <div className="nav-inner">
          <Link href="/" className="nav-logo" aria-label="KeebForge.in Home">
            <span>KeebForge</span>
            <span className="logo-dot">.</span>
            <span>in</span>
          </Link>
          <div className="nav-links">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="nav-link">
                {l.label}
              </Link>
            ))}
            {!session && (
              <Link href="/login" className="nav-link">
                Sign in
              </Link>
            )}
          </div>
          <Link href="/cart" className="nav-icon" aria-label="Cart">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 3h2l2.4 12.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 7H6M9 21a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm8 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              ) : (
                <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </nav>
      {menuOpen && (
        <div className="mobile-menu open">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={closeMenu}>
              {l.label}
            </Link>
          ))}
          <Link href="/cart" className="nav-cta" onClick={closeMenu} style={{ marginTop: 12, alignSelf: "flex-start" }}>
            Cart
          </Link>
          {!session && (
            <Link href="/login" className="nav-cta" onClick={closeMenu} style={{ marginTop: 12, alignSelf: "flex-start" }}>
              Sign in
            </Link>
          )}
        </div>
      )}
    </>
  );
}