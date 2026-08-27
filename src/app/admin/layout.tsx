import type { Metadata } from "next";
import { requireAdminContext } from "@/lib/auth/admin";
import { allowedNavHrefs } from "@/lib/auth/roles";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: "Admin | KeebForge",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
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
