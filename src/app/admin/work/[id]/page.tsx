import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";
import { WorkForm, type WorkProjectProp } from "@/components/admin/work/WorkForm";

export const metadata: Metadata = {
  title: "Edit Project | KeebForge Admin",
  robots: { index: false, follow: false },
};

export default async function AdminWorkEditPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("setting", "update");
  const { id } = await params;
  const project = await prisma.workProject.findUnique({ where: { id } });
  if (!project) notFound();

  const prop: WorkProjectProp = {
    id: project.id,
    title: project.title,
    slug: project.slug,
    description: project.description,
    category: project.category,
    workPerformed: project.workPerformed,
    date: project.date ? project.date.toISOString().slice(0, 10) : null,
    featured: project.featured,
    active: project.active,
    sortOrder: project.sortOrder,
    images: (project.images as { url: string; publicId?: string | null }[] | null) ?? [],
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
        Edit project
      </h1>
      <WorkForm project={prop} />
    </div>
  );
}