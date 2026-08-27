"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Profile } from "@prisma/client";

const NAV_ITEMS = [
  { href: "/account", label: "Overview", icon: OverviewIcon },
  { href: "/account/profile", label: "Profile & Addresses", icon: ProfileIcon },
  { href: "/account/orders", label: "Orders", icon: OrdersIcon },
  { href: "/account/settings", label: "Settings", icon: SettingsIcon },
] as const;

const PAGE_HEADERS: Record<string, { title: string; subtitle: string }> = {
  "/account/profile": {
    title: "Profile & Addresses",
    subtitle: "Your personal information and saved shipping addresses",
  },
  "/account/orders": {
    title: "My Orders",
    subtitle: "View and track all your orders",
  },
  "/account/settings": {
    title: "Settings",
    subtitle: "Manage your account preferences and security",
  },
};

function OverviewIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function OrdersIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

interface AccountLayoutProps {
  profile: Profile;
  children: React.ReactNode;
}

export function AccountLayout({ profile, children }: AccountLayoutProps) {
  const pathname = usePathname();

  const initials = profile.name
    ? profile.name.trim().split(/\s+/).map((p) => p[0]).join("").toUpperCase().slice(0, 2)
    : profile.email.slice(0, 2).toUpperCase();

  const isOverview = pathname === "/account";
  const header = PAGE_HEADERS[pathname];

  return (
    <div className="account-page">
      <aside className="account-sidebar" aria-label="Account navigation">
        <nav className="account-nav" aria-label="Account sections">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`account-nav-item${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="account-nav-icon" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="account-sidebar-footer">
          <p className="account-user-info">
            <span className="account-user-name">{profile.name ?? "Customer"}</span>
            <span className="account-user-email">{profile.email}</span>
          </p>
        </div>
      </aside>

      <main className="account-main">
        <div className="account-main-inner">
          <header className="account-page-header">
            {isOverview ? (
              <>
                <span className="account-avatar">{initials}</span>
                <div>
                  <span className="account-kicker">{"// Your Account"}</span>
                  <h1 className="account-page-title">{profile.name ?? "My Account"}</h1>
                  <p className="account-page-desc">Manage your account, orders, and preferences</p>
                </div>
              </>
            ) : (
              <div>
                <span className="account-kicker">{"// Your Account"}</span>
                <h1 className="account-page-title">{header?.title ?? "My Account"}</h1>
                <p className="account-page-desc">{header?.subtitle ?? ""}</p>
              </div>
            )}
          </header>

          {children}
        </div>
      </main>
    </div>
  );
}