"use client";

import { authClient } from "@/lib/auth/auth-client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState, useRef } from "react";
import CartIcon from "@/components/icons/cart-icon";
import type { AnimatedIconHandle } from "@/components/icons/types";
import UserPlusIcon from "@/components/icons/user-plus-icon";
import UserIcon from "@/components/icons/user-icon";

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}


const LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/mods", label: "Mods" },
  { href: "/workshop", label: "Workshop" },
  { href: "/work", label: "Work" },
];

const SHOP_LINKS = [
  { href: "/shop/custom", label: "Made to Order", desc: "Custom products built specifically for you." },
  { href: "/shop/products", label: "Brand New", desc: "New products available from KeebForge." },
  { href: "/shop/clearance", label: "Clearance", desc: "Discounted, open-box & older-stock items." },
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
  const [shopOpen, setShopOpen] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const profileRef = useRef<HTMLDivElement>(null);
  const shopRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { data: session } = authClient.useSession();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ponytail: count comes from the existing cart API; same-page adds re-sync
  // via the "kf-cart-changed" event dispatched by AddToCart/CardAddToCart.
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/cart")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && d && Array.isArray(d.items)) {
            setCartCount(d.items.reduce((n: number, i: { quantity?: number }) => n + (i.quantity ?? 1), 0));
          }
        })
        .catch(() => {});
    load();
    window.addEventListener("kf-cart-changed", load);
    return () => {
      alive = false;
      window.removeEventListener("kf-cart-changed", load);
    };
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (shopRef.current && !shopRef.current.contains(e.target as Node)) {
        setShopOpen(false);
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

  // Animated nav icons play when the pointer is anywhere over the parent
  // link/button, not only over the icon glyph itself.
  const cartIconRef = useRef<AnimatedIconHandle>(null);
  const signInIconRef = useRef<AnimatedIconHandle>(null);
  const userIconRef = useRef<AnimatedIconHandle>(null);

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
            {LINKS.map((l) =>
              l.href === "/shop" ? (
                <div
                  key={l.href}
                  className="nav-shop"
                  ref={shopRef}
                  onMouseEnter={() => setShopOpen(true)}
                  onMouseLeave={() => setShopOpen(false)}
                >
                  <Link
                    href="/shop"
                    className={`nav-link nav-shop-trigger${isActive(pathname, "/shop") ? " active" : ""}`}
                    aria-current={isActive(pathname, "/shop") ? "page" : undefined}
                  >
                    {l.label}
                  </Link>
                  <button
                    type="button"
                    className="nav-shop-arrow"
                    aria-label="Open shop menu"
                    aria-expanded={shopOpen}
                    aria-haspopup="true"
                    onClick={() => setShopOpen((v) => !v)}
                  >
                    <svg
                      className={`nav-shop-chev${shopOpen ? " open" : ""}`}
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {shopOpen && (
                    <div className="nav-shop-menu" role="menu">
                      <Link href="/shop" className="nav-shop-item" role="menuitem" onClick={() => setShopOpen(false)}>
                        <span className="nav-shop-item-label">All Products</span>
                        <span className="nav-shop-item-desc">Everything in the shop</span>
                      </Link>
                      {SHOP_LINKS.map((s) => (
                        <Link
                          key={s.href}
                          href={s.href}
                          className="nav-shop-item"
                          role="menuitem"
                          aria-current={isActive(pathname, s.href) ? "page" : undefined}
                          onClick={() => setShopOpen(false)}
                        >
                          <span className="nav-shop-item-label">{s.label}</span>
                          <span className="nav-shop-item-desc">{s.desc}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`nav-link${isActive(pathname, l.href) ? " active" : ""}`}
                  aria-current={isActive(pathname, l.href) ? "page" : undefined}
                >
                  {l.label}
                </Link>
              )
            )}
          </div>
          <div className="nav-actions">
            <Link href="/shop/cart" className="nav-icon nav-cart" onMouseEnter={() => cartIconRef.current?.startAnimation()} onMouseLeave={() => cartIconRef.current?.stopAnimation()} aria-label={cartCount > 0 ? `Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}` : "Cart"}>
              <CartIcon ref={cartIconRef} size={20} strokeWidth={1.6} />
              {cartCount > 0 && (
                <span className="nav-cart-badge" aria-hidden="true">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </Link>
            {session ? (
              <div className="nav-profile" ref={profileRef}>
                <button
                  type="button"
                  className="nav-profile-trigger"
                  onMouseEnter={() => userIconRef.current?.startAnimation()} onMouseLeave={() => userIconRef.current?.stopAnimation()}
                  aria-expanded={profileOpen}
                  aria-haspopup="true"
                  aria-label="Account menu"
                  onClick={() => setProfileOpen((v) => !v)}
                >
                  <UserIcon ref={userIconRef} size={20} strokeWidth={1.6} />
                </button>
                {profileOpen && (
                  <div className="nav-profile-dropdown" role="menu">
                    <div className="nav-profile-header">
                      <span className="nav-avatar nav-avatar-lg">{userInitials}</span>
                      <div>
                        <p className="nav-profile-name">{userName}</p>
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
              <Link href="/auth/login" className="nav-icon" aria-label="Sign in" title="Sign in" onMouseEnter={() => signInIconRef.current?.startAnimation()} onMouseLeave={() => signInIconRef.current?.stopAnimation()}>
                <UserPlusIcon ref={signInIconRef} size={20} strokeWidth={1.6} />
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
        </div>
      </nav>
      {menuOpen && (
        <div className="mobile-menu open">
          {LINKS.map((l) => (
            <Fragment key={l.href}>
              <Link
                href={l.href}
                className={isActive(pathname, l.href) ? "active" : undefined}
                aria-current={isActive(pathname, l.href) ? "page" : undefined}
                onClick={closeMenu}
              >
                {l.label}
              </Link>
              {l.href === "/shop" &&
                SHOP_LINKS.map((s) => (
                  <Link key={s.href} href={s.href} className="mobile-menu-sub" onClick={closeMenu}>
                    {s.label}
                  </Link>
                ))}
            </Fragment>
          ))}
          {session ? (
            <>
              <Link href="/account" className="nav-cta mobile-menu-extra" onClick={closeMenu}>
                My Account
              </Link>
              <button onClick={() => { handleSignOut(); closeMenu(); }} className="nav-cta mobile-menu-extra" type="button">
                Sign out
              </button>
            </>
          ) : (
            <Link href="/auth/login" className="nav-cta mobile-menu-extra" onClick={closeMenu}>
              Sign in
            </Link>
          )}
        </div>
      )}
    </>
  );
}