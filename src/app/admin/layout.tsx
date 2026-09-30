import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/auth/admin";
import { allowedNavHrefs } from "@/lib/auth/roles";
import { adminPanelEnabled } from "@/lib/config/environment";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: "Admin | KeebForge",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Mirrors the proxy gate so a disabled panel also blocks the RSC payload and
  // any server action resolving through this layout. Routing convenience only —
  // requireAdminContext() below remains the authorization boundary.
  if (!adminPanelEnabled((await headers()).get("host") ?? "")) {
    notFound();
  }

  // Authorization happens here, server-side, before any admin data renders:
  // no session → /login; non-admin role → /unauthorized.
  const ctx = await requireAdminContext();

  return (
    <AdminShell
      name={ctx.user.name ?? ""}
      email={ctx.user.email ?? ""}
      role={ctx.profile.role}
      allowedNav={allowedNavHrefs(ctx.profile.role)}
    >
      {children}
    </AdminShell>
  );
}
