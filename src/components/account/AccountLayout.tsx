"use client";

import { usePathname } from "next/navigation";

interface PageHeader {
  title: string;
  subtitle: string;
  /**
   * Settings labels itself with section headers (Preferences / Security /
   * Irreversible Actions), so a page title above them is noise. The h1 stays
   * for screen readers.
   */
  hideBanner?: boolean;
}

const PAGE_HEADERS: Record<string, PageHeader> = {
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
    hideBanner: true,
  },
};

interface AccountLayoutProps {
  children: React.ReactNode;
}

export function AccountLayout({ children }: AccountLayoutProps) {
  const pathname = usePathname();
  const header = PAGE_HEADERS[pathname];

  return (
    <div className="account-page">
      {header?.hideBanner ? (
        <h1 className="sr-only">{header.title}</h1>
      ) : (
        <header className="account-page-header">
          <span className="account-kicker">{"// Your Account"}</span>
          <h1 className="account-page-title">
            {header?.title ?? "My Account"}
          </h1>
          {header?.subtitle && (
            <p className="account-page-desc">{header.subtitle}</p>
          )}
        </header>
      )}
      {children}
    </div>
  );
}
