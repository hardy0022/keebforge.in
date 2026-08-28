import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";
import { WorkList } from "@/components/admin/work/WorkList";

export const metadata: Metadata = {
  title: "Work | KeebForge Admin",
  robots: { index: false, follow: false },
};

export default async function AdminWorkPage() {
  await requirePermission("setting", "update");
  const projects = await prisma.workProject.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const rows = projects.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    category: p.category,
    date: p.date ? p.date.toISOString().slice(0, 10) : null,
    active: p.active,
    featured: p.featured,
    sortOrder: p.sortOrder,
    imageCount: (p.images as { url: string }[] | null)?.length ?? 0,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          Work / Portfolio <span className="muted num">({projects.length})</span>
        </h1>
        <div className="admin-actions" style={{ margin: 0 }}>
          <Link href="/admin/work/new" className="btn-admin primary">
            + New project
          </Link>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="empty">
          <b>No projects yet</b>
          Add your first build or repair to the public portfolio.
        </div>
      ) : (
        <WorkList rows={rows} />
      )}
    </div>
  );
}