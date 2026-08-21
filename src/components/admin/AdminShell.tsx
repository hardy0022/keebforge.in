"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createAuthClient } from "better-auth/react";

const authClient = createAuthClient();

const NAV: { href: string; label: string; icon: string }[] = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/orders", label: "Orders", icon: "🧾" },
  { href: "/admin/repairs", label: "Repairs", icon: "🔧" },
  { href: "/admin/products", label: "Products", icon: "⌨️" },
  { href: "/admin/services", label: "Services", icon: "🛠️" },
  { href: "/admin/customers", label: "Customers", icon: "👥" },
  { href: "/admin/payments", label: "Payments", icon: "💳" },
  { href: "/admin/shipments", label: "Shipments", icon: "📦" },
  { href: "/admin/reviews", label: "Reviews", icon: "⭐" },
  { href: "/admin/content", label: "Content", icon: "📝" },
  { href: "/admin/coupons", label: "Coupons", icon: "🏷️" },
  { href: "/admin/analytics", label: "Analytics", icon: "📈" },
  { href: "/admin/activity", label: "Activity", icon: "🕘" },
  { href: "/admin/admins", label: "Admin users", icon: "🛡️" },
  { href: "/admin/settings", label: "Settings", icon: "⚙️" },
];

export function AdminShell({
  name,
  email,
  role,
  children,
}: {
  name: string;
  email: string;
  role: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = (name || email)
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const sidebar = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "14px 16px",
          borderBottom: "1px solid var(--bdr)",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: "1.2rem" }}>⌨️</span>
        {!collapsed && (
          <span style={{ fontFamily: "var(--ff-display)", fontWeight: 700, letterSpacing: "-0.02em" }}>
            KeebForge
            <span style={{ color: "var(--acc)" }}> Admin</span>
          </span>
        )}
      </div>
      <nav style={{ flex: 1, overflowY: "auto", padding: "10px", display: "flex", flexDirection: "column", gap: "2px" }}>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={`sidebar-link${isActive(item.href) ? " active" : ""}`}
            style={collapsed ? { justifyContent: "center", padding: "9px 0" } : undefined}
            onClick={() => setOpen(false)}
          >
            <span className="ico">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>
      <div
        style={{
          padding: "12px",
          borderTop: "1px solid var(--bdr)",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <span className="avatar" style={{ width: 30, height: 30, fontSize: "0.62rem" }}>
          {initials}
        </span>
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {name || email}
            </div>
            <div className="muted" style={{ fontSize: "0.68rem" }}>
              {role}
            </div>
          </div>
        )}
        <button className="btn-admin sm" style={{ padding: "5px 8px" }} onClick={signOut} title="Sign out">
          ⏻
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Desktop sidebar */}
      <aside
        className="kf-sidebar-desktop"
        style={{
          position: "fixed",
          inset: "0 auto 0 0",
          width: collapsed ? 60 : 230,
          background: "linear-gradient(180deg, var(--surf), transparent), var(--bg1)",
          borderRight: "1px solid var(--bdr)",
          zIndex: 50,
          transition: "width 0.22s var(--ease-out)",
        }}
      >
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(8,7,12,0.7)",
            backdropFilter: "blur(3px)",
          }}
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 70,
          width: "min(80vw, 280px)",
          background: "var(--bg1)",
          borderRight: "1px solid var(--bdr)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s var(--ease-out)",
          display: "none",
        }}
        className="kf-mobile-sidebar"
      >
        {sidebar}
      </aside>

      {/* Main */}
      <div style={{ marginLeft: collapsed ? 60 : 230, transition: "margin 0.22s var(--ease-out)" }} className="kf-admin-main">
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "12px var(--pad-x)",
            background: "rgba(10,9,16,0.85)",
            backdropFilter: "blur(8px)",
            borderBottom: "1px solid var(--bdr)",
          }}
        >
          <button className="btn-admin sm kf-sidebar-toggle" onClick={() => setCollapsed((c) => !c)} title="Toggle sidebar">
            ◀
          </button>
          <button className="btn-admin sm kf-drawer-open" onClick={() => setOpen(true)} title="Menu">
            ☰
          </button>
          <div className="muted" style={{ fontSize: "0.8rem" }}>
            {path.split("/").filter(Boolean).join(" / ") || "dashboard"}
          </div>
        </header>
        <main style={{ padding: "24px var(--pad-x) 64px", maxWidth: 1400, margin: "0 auto" }}>{children}</main>
      </div>
    </div>
  );
}