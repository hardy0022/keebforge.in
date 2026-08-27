import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminContext } from "@/lib/auth/admin";
import { canAction } from "@/lib/auth/roles";
import { cloudinaryConfigured, deleteImage, mediaFolder, repairRoleFolder, uploadBuffer } from "@/lib/cloudinary";
import { IMAGE_TYPES_MESSAGE, isAllowedImageMime, sniffImageType } from "@/lib/image-validation";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * POST /api/uploads — ADMIN ONLY (customer repair photos go through the
 * repair-request server action instead).
 *
 * Multipart: file, entityType (PRODUCT|REPAIR|ORDER), entityId, role,
 * optional alt/sortOrder. The SERVER decides the Cloudinary folder from the
 * entity coordinates — the browser never picks storage paths.
 *
 * REPAIR/ORDER uploads get a Media row immediately. PRODUCT uploads are
 * returned to the form and persisted via the catalog action (drafts are kept
 * in keebforge/products/drafts/{token} until the product row exists).
 */
export async function POST(request: NextRequest) {
  // Any KeebForge team member may upload; PRODUCT images additionally require
  // product:update (staff/manager scope), since they feed the public catalog.
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  if (!cloudinaryConfigured()) {
    return NextResponse.json(
      { error: "Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to your environment." },
      { status: 501 }
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const entityType = String(form.get("entityType") ?? "");
  const entityId = String(form.get("entityId") ?? "").trim();
  const role = String(form.get("role") ?? "OTHER");

  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (!["PRODUCT", "REPAIR", "ORDER"].includes(entityType) || !entityId || entityId.length > 80) {
    return NextResponse.json({ error: "Invalid upload target." }, { status: 400 });
  }
  if (!isAllowedImageMime(file.type)) {
    return NextResponse.json({ error: IMAGE_TYPES_MESSAGE }, { status: 400 });
  }
  if (entityType === "PRODUCT" && !canAction(ctx.profile.role, "product", "update")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (entityType !== "PRODUCT" && !canAction(ctx.profile.role, "repair", "update")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_BYTES) return NextResponse.json({ error: "Image exceeds the 8 MB limit." }, { status: 400 });
  if (!sniffImageType(buffer)) return NextResponse.json({ error: "That file isn't a valid image." }, { status: 400 });

  // Repairs are keyed by their business order number (keebforge/repairs/
  // KF1234567/<role>) so customer- and admin-uploaded photos share one folder;
  // entityId stays the stable OrderRepair row id.
  let folder: string;
  if (entityType === "REPAIR") {
    const repair = await prisma.orderRepair.findUnique({
      where: { id: entityId },
      select: { order: { select: { orderNumber: true } } },
    });
    if (!repair) return NextResponse.json({ error: "Repair not found." }, { status: 404 });
    folder = repairRoleFolder(repair.order.orderNumber, role);
  } else {
    folder = mediaFolder(entityType as "PRODUCT" | "ORDER", entityId, role);
  }

  try {
    const result = await uploadBuffer(buffer, { folder });
    let mediaRow = null;
    if (entityType !== "PRODUCT") {
      try {
        mediaRow = await prisma.media.create({
          data: {
            publicId: result.publicId,
            secureUrl: result.url,
            entityType: entityType === "REPAIR" ? "REPAIR" : "ORDER",
            entityId,
            folder,
            role: normalizeRole(role),
            ...(form.get("alt") ? { altText: String(form.get("alt")).slice(0, 200) } : {}),
            sortOrder: Number(form.get("sortOrder")) || 0,
            width: result.width,
            height: result.height,
          },
        });
      } catch (e) {
        // Upload landed but the row didn't — remove the orphaned asset.
        console.error("[uploads] Media row failed after upload:", e);
        await deleteImage(result.publicId);
        throw e;
      }
    }
    return NextResponse.json({
      ok: true,
      id: mediaRow?.id ?? null,
      // Full row for panels that render straight from the response (admin
      // repair images); flat fields kept for the product form's draft assets.
      ...(mediaRow
        ? {
            media: {
              id: mediaRow.id,
              publicId: mediaRow.publicId,
              secureUrl: mediaRow.secureUrl,
              role: mediaRow.role,
              sortOrder: mediaRow.sortOrder,
            },
          }
        : {}),
      url: result.url,
      publicId: result.publicId,
      width: result.width,
      height: result.height,
    });
  } catch (e) {
    console.error("[uploads] Cloudinary upload failed:", e);
    return NextResponse.json({ error: "Unable to upload image. Please try again." }, { status: 502 });
  }
}

function normalizeRole(role: string): "BEFORE" | "AFTER" | "DIAGNOSTIC" | "WORK" | "FINAL" | "CUSTOMER_UPLOAD" | "OTHER" {
  const allowed = ["BEFORE", "AFTER", "DIAGNOSTIC", "WORK", "FINAL", "CUSTOMER_UPLOAD"] as const;
  return (allowed as readonly string[]).includes(role) ? (role as (typeof allowed)[number]) : "OTHER";
}

/**
 * DELETE /api/uploads?id=<mediaId> — removes a Media row and its Cloudinary
 * asset (asset failure is logged, not swallowed). Admin only.
 */
export async function DELETE(request: NextRequest) {
  // Deleting media mutates catalog/repair records — require product or repair
  // update rights; the media's entity decides which.
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canAction(ctx.profile.role, "product", "update") && !canAction(ctx.profile.role, "repair", "update")) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  // Two deletion paths: ?id=<media row> (row + asset) or ?publicId=<pid>
  // (asset only — used for freshly-uploaded product drafts with no row yet).
  const mediaId = request.nextUrl.searchParams.get("id");
  const publicId = request.nextUrl.searchParams.get("publicId");
  if (!mediaId && !publicId) return NextResponse.json({ error: "Missing media id." }, { status: 400 });

  if (publicId) {
    const destroyed = await deleteImage(publicId);
    if (!destroyed) console.error(`[uploads] failed to destroy asset: ${publicId}`);
    return NextResponse.json({ ok: true });
  }

  const media = await prisma.media.findUnique({ where: { id: mediaId! } });
  if (!media) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const destroyed = await deleteImage(media.publicId);
  await prisma.media.delete({ where: { id: media.id } });
  if (!destroyed) console.error(`[uploads] orphaned Cloudinary asset: ${media.publicId}`);
  return NextResponse.json({ ok: true });
}
