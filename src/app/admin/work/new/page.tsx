import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { WorkForm } from "@/components/admin/work/WorkForm";

export const metadata: Metadata = {
  title: "New Project | KeebForge Admin",
  robots: { index: false, follow: false },
};

export default async function AdminWorkNewPage() {
  await requirePermission("setting", "update");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em" }}>New project</h1>
      <WorkForm />
    </div>
  );
}