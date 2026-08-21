"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient();

const LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/services", label: "Services" },
  { href: "/repair", label: "Repair" },
  { href: "/work", label: "Work" },
];

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "U";
}

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const { data: session } = authClient.useSession();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const closeMenu = () => setMenuOpen(false);

  const handleSignOut = async () => {
    await authClient.signOut();
    closeMenu();
    setProfileOpen(false);
  };

  const userInitials = session?.user ? getInitials(session.user.name, session.user.email) : "U";
  const userName = session?.user?.name ?? "Account";
  const userEmail = session?.user?.email ?? "";

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
          {session ? (
            <div className="nav-profile" ref={profileRef}>
              <button
                type="button"
                className="nav-profile-trigger"
                aria-expanded={profileOpen}
                aria-haspopup="true"
                aria-label="Account menu"
                onClick={() => setProfileOpen((v) => !v)}
              >
                <span className="nav-avatar">{userInitials}</span>
              </button>
              {profileOpen && (
                <div className="nav-profile-dropdown" role="menu">
                  <div className="nav-profile-header">
                    <span className="nav-avatar nav-avatar-lg">{userInitials}</span>
                    <div>
                      <p className="nav-profile-name">{userName}</p>
                      <p className="nav-profile-email">{userEmail}</p>
                    </div>
                  </div>
                  <div className="nav-profile-divider" />
                  <Link href="/account" className="nav-profile-item" role="menuitem" onClick={() => setProfileOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    My Account
                  </Link>
                  <Link href="/account/orders" className="nav-profile-item" role="menuitem" onClick={() => setProfileOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                    My Orders
                  </Link>
                  <Link href="/account/addresses" className="nav-profile-item" role="menuitem" onClick={() => setProfileOpen(false)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    Addresses
                  </Link>
                  <div className="nav-profile-divider" />
                  <button className="nav-profile-item nav-profile-signout" role="menuitem" onClick={handleSignOut} type="button">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login" className="nav-link">
              Sign in
            </Link>
          )}
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
          {session ? (
            <>
              <Link href="/account" className="nav-cta" onClick={closeMenu} style={{ marginTop: 12, alignSelf: "flex-start" }}>
                My Account
              </Link>
              <button onClick={() => { handleSignOut(); closeMenu(); }} className="nav-cta" style={{ marginTop: 12, alignSelf: "flex-start" }} type="button">
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="nav-cta" onClick={closeMenu} style={{ marginTop: 12, alignSelf: "flex-start" }}>
              Sign in
            </Link>
          )}
        </div>
      )}
    </>
  );
}