"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { WorkCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/admin";
import { deleteImage, mediaFolder, uploadBuffer } from "@/lib/cloudinary";
import { IMAGE_TYPES_MESSAGE, isAllowedImageMime, sniffImageType } from "@/lib/image-validation";
import type { ActionState } from "@/components/admin/ActionForm";

const MAX_IMAGES = 20;
const MAX_BYTES = 8 * 1024 * 1024;

type WorkImageEntry = { url: string; publicId: string | null };

type ImageStateEntry = { url?: string; publicId?: string | null; fileIndex?: number };

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "project";
}

const CLOSE_PATHS = ["/work", "/admin/work"];

export async function saveWork(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("setting", "update");

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { error: "A short description is required." };

  const categoryRaw = String(formData.get("category") ?? "");
  if (!(categoryRaw in WorkCategory)) return { error: "Invalid category." };

  const slug = slugify(String(formData.get("slug") ?? "").trim() || title);
  const workPerformed = String(formData.get("workPerformed") ?? "").trim() || null;
  const dateRaw = String(formData.get("date") ?? "");
  const date = dateRaw ? new Date(`${dateRaw}T00:00:00.000Z`) : null;
  if (date && Number.isNaN(date.getTime())) return { error: "Invalid date." };
  const featured = String(formData.get("featured")) === "on";
  const active = String(formData.get("active")) === "on";
  const sortOrder = Math.max(0, Math.floor(Number(formData.get("sortOrder")) || 0));

  let imageState: ImageStateEntry[] = [];
  try {
    imageState = JSON.parse(String(formData.get("workImages") ?? "[]"));
  } catch {
    return { error: "Image data is malformed." };
  }
  if (!Array.isArray(imageState) || imageState.length > MAX_IMAGES) return { error: `At most ${MAX_IMAGES} images per project.` };

  let removedPublicIds: string[] = [];
  try {
    const r = JSON.parse(String(formData.get("removedImages") ?? "[]"));
    if (Array.isArray(r)) removedPublicIds = r.filter((x): x is string => typeof x === "string");
  } catch {
    return { error: "Removed-image data is malformed." };
  }

  const existingId = String(formData.get("id") ?? "").trim();
  const projectId = existingId || randomUUID();

  if (slug) {
    const clash = await prisma.workProject.findFirst({ where: { slug, NOT: existingId ? { id: existingId } : undefined }, select: { id: true } });
    if (clash) return { error: "A project with that slug already exists — use a different title or slug." };
  }

  const folder = mediaFolder("WORK", projectId);
  const images: WorkImageEntry[] = [];
  const newlyUploaded: string[] = [];
  for (const entry of imageState) {
    if (!entry || typeof entry !== "object") return { error: "Image data is malformed." };
    if (entry.url) {
      images.push({ url: entry.url, publicId: entry.publicId ?? null });
      continue;
    }
    if (typeof entry.fileIndex !== "number") return { error: "Image data is malformed." };
    const file = formData.get(`file-${entry.fileIndex}`);
    if (!(file instanceof File) || file.size === 0) continue;
    if (file.size > MAX_BYTES) return { error: "One of the images exceeds the 8 MB limit." };
    if (!isAllowedImageMime(file.type)) return { error: IMAGE_TYPES_MESSAGE };
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!sniffImageType(buffer)) return { error: "That file isn't a valid image." };
    try {
      const up = await uploadBuffer(buffer, { folder });
      newlyUploaded.push(up.publicId);
      images.push({ url: up.url, publicId: up.publicId });
    } catch (e) {
      console.error("[work] image upload failed:", e);
      for (const p of newlyUploaded) await deleteImage(p).catch(() => {});
      return { error: "Unable to upload image. Please try again." };
    }
  }
  if (images.length === 0) return { error: "Add at least one image." };

  try {
    await prisma.workProject.upsert({
      where: { id: projectId },
      create: {
        id: projectId,
        title,
        slug,
        description,
        category: categoryRaw as WorkCategory,
        workPerformed,
        date,
        featured,
        active,
        sortOrder,
        images,
      },
      update: {
        title,
        slug,
        description,
        category: categoryRaw as WorkCategory,
        workPerformed,
        date,
        featured,
        active,
        sortOrder,
        images,
      },
    });
  } catch (e) {
    console.error("[work] save failed:", e);
    for (const p of newlyUploaded) await deleteImage(p).catch(() => {});
    return { error: "Unable to save the project. Please try again." };
  }

  // Remove Cloudinary assets for images dropped from the project.
  for (const publicId of removedPublicIds) {
    await deleteImage(publicId).catch((e) => console.error(`[work] delete asset failed: ${publicId}`, e));
  }

  for (const path of CLOSE_PATHS) revalidatePath(path);
  revalidatePath(`/work/${slug}`);
  revalidatePath("/admin/work");
  revalidatePath(`/admin/work/${projectId}`);
  revalidatePath("/admin/work/new");
  return { ok: true, message: "Project saved", id: projectId };
}

export async function toggleWork(projectId: string, active: boolean): Promise<ActionState> {
  await requirePermission("setting", "update");
  await prisma.workProject.update({ where: { id: projectId }, data: { active } });
  for (const path of CLOSE_PATHS) revalidatePath(path);
  revalidatePath("/admin/work");
  return { ok: true, message: active ? "Published" : "Unpublished" };
}

export async function moveWork(projectId: string, delta: 1 | -1): Promise<ActionState> {
  await requirePermission("setting", "update");
  const all = await prisma.workProject.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const from = all.findIndex((p) => p.id === projectId);
  if (from < 0) return { error: "Project not found." };
  const to = from + delta;
  if (to < 0 || to >= all.length) return { error: "Already at the edge of the list." };
  const ordered = [...all];
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  await prisma.$transaction(ordered.map((p, i) => prisma.workProject.update({ where: { id: p.id }, data: { sortOrder: i } })));
  for (const path of CLOSE_PATHS) revalidatePath(path);
  revalidatePath("/admin/work");
  return { ok: true, message: "Reordered" };
}

export async function deleteWork(projectId: string): Promise<ActionState> {
  await requirePermission("setting", "update");
  const project = await prisma.workProject.findUnique({ where: { id: projectId } });
  if (!project) return { error: "Project not found." };
  await prisma.workProject.delete({ where: { id: projectId } });
  const images = (project.images as WorkImageEntry[]) ?? [];
  for (const img of images) {
    if (img.publicId) await deleteImage(img.publicId).catch((e) => console.error(`[work] delete asset failed: ${img.publicId}`, e));
  }
  for (const path of CLOSE_PATHS) revalidatePath(path);
  revalidatePath("/admin/work");
  return { ok: true, message: "Project deleted" };
}