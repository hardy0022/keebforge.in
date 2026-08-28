"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentAuth } from "@/lib/auth";
import {
  cloudinaryConfigured,
  deleteImage,
  mediaFolder,
  uploadBuffer,
} from "@/lib/cloudinary";
import { IMAGE_TYPES_MESSAGE, sniffImageType } from "@/lib/image-validation";
import { MAX_REVIEW_IMAGES, recalcProductRating, verifiedProfileIds } from "@/lib/reviews";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type ReviewSubmitState = { ok?: boolean; redirectTo?: string; error?: string };

/** Server-only validation + persist for a customer product review (create or edit). */
export async function submitReview(_prev: ReviewSubmitState, formData: FormData): Promise<ReviewSubmitState> {
  const { user, profile } = await getCurrentAuth();
  if (!user || !profile) return { error: "Please sign in to write a review." };

const slug = String(formData.get("slug") ?? "").trim();
  const ratingRaw = Number(formData.get("rating"));
  const rating = Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const removeIds = formData
    .getAll("removeMedia")
    .map(String)
    .filter((s) => s.length > 0);
  const general = slug.length === 0;

  if (!rating) return { error: "Please choose a star rating between 1 and 5." };
  if (title.length > 30) return { error: "Your title is limited to 30 characters — please shorten it." };
  if (body.length < 10) return { error: "Please write at least a sentence or two (10+ characters)." };
  if (body.length > 2000) return { error: "Your review is too long — please keep it under 2,000 characters." };

  const product = general
    ? null
    : await prisma.product.findFirst({
        where: { slug, active: true },
        select: { id: true, name: true, slug: true },
      });
  if (!general && !product) return { error: "This product is no longer available to review." };

  const existing = product
    ? await prisma.review.findUnique({
        where: { profileId_productId: { profileId: profile.id, productId: product.id } },
      })
    : await prisma.review.findFirst({ where: { profileId: profile.id, type: "GENERAL" }, orderBy: { createdAt: "desc" } });
  if (existing && product && existing.type !== "PRODUCT") {
    return { error: "Unexpected review state — please contact support." };
  }

  const existingMedia = existing
    ? await prisma.media.findMany({ where: { entityType: "REVIEW", entityId: existing.id } })
    : [];
  const kept = existingMedia.filter((m) => !removeIds.includes(m.id));
  if (removeIds.some((id) => !existingMedia.some((m) => m.id === id))) {
    return { error: "Requested photo removal could not be resolved." };
  }

  const rawImages = formData.getAll("images").filter((f): f is File => f instanceof File);
  if (rawImages.length + kept.length > MAX_REVIEW_IMAGES) {
    return { error: `You can attach at most ${MAX_REVIEW_IMAGES} photos.` };
  }
  if (rawImages.length > 0 && !cloudinaryConfigured()) {
    return { error: "Photo upload is temporarily unavailable — you can submit your review without photos." };
  }
  // Validate by file bytes, not browser-reported MIME — gallery/camera picks often
  // report an empty or heic type under a generic "blob" name while being valid JPEG/PNG.
  const images = await Promise.all(
    rawImages.map(async (f) => ({ name: f.name, buffer: Buffer.from(await f.arrayBuffer()) })),
  );
  for (const img of images) {
    if (img.buffer.length > MAX_IMAGE_BYTES)
      return { error: `Each photo must be under 5 MB — "${img.name}" is too large.` };
    if (!sniffImageType(img.buffer)) return { error: `"${img.name}" isn't a valid image. ${IMAGE_TYPES_MESSAGE}` };
  }

const verified = product ? (await verifiedProfileIds(product.id, [profile.id])).has(profile.id) : false;
  const reviewId = existing?.id ?? `review-${crypto.randomUUID()}`;

  // Upload new photos once the row exists so they land in the review's own folder.
  const uploaded: { url: string; publicId: string; width: number; height: number }[] = [];
  if (images.length > 0) {
    const folder = mediaFolder("REVIEW", reviewId);
    try {
      for (const img of images) {
        uploaded.push(await uploadBuffer(img.buffer, { folder }));
      }
    } catch (e) {
      console.error("Review photo upload error:", e);
      for (const u of uploaded) await deleteImage(u.publicId).catch(() => {});
      return { error: "One or more photos failed to upload. Please retry, or submit without photos." };
    }
  }

  const common = {
    rating,
    title: title || null,
    body,
    authorName: profile.name,
  };

  try {
    if (existing) {
      await prisma.review.update({ where: { id: existing.id }, data: { ...common, verified } });
      // Remove retired photos (Cloudinary best-effort — a failed delete must not block).
      for (const m of existingMedia.filter((m) => !kept.some((k) => k.id === m.id))) {
        await deleteImage(m.publicId).catch(() => {});
      }
      await prisma.media.deleteMany({ where: { entityType: "REVIEW", entityId: existing.id, id: { in: removeIds } } });
      if (uploaded.length > 0) {
        await prisma.media.createMany({
          data: uploaded.map((u, i) => ({
            publicId: u.publicId,
            secureUrl: u.url,
            entityType: "REVIEW" as const,
            entityId: existing.id,
            folder: mediaFolder("REVIEW", existing.id),
            role: "CUSTOMER_UPLOAD" as const,
            sortOrder: kept.length + i,
            width: u.width,
            height: u.height,
          })),
        });
      }
    } else if (product) {
      await prisma.review.create({
        data: {
          id: reviewId,
          profileId: profile.id,
          productId: product.id,
          type: "PRODUCT",
          ...common,
          verified,
          productNameSnapshot: product.name,
          productSlugSnapshot: product.slug,
          status: "PENDING",
        },
      });
      if (uploaded.length > 0) {
        await prisma.media.createMany({
          data: uploaded.map((u, i) => ({
            publicId: u.publicId,
            secureUrl: u.url,
            entityType: "REVIEW" as const,
            entityId: reviewId,
            folder: mediaFolder("REVIEW", reviewId),
            role: "CUSTOMER_UPLOAD" as const,
            sortOrder: i,
            width: u.width,
            height: u.height,
          })),
        });
      }
    } else {
      await prisma.review.create({
        data: {
          id: reviewId,
          profileId: profile.id,
          type: "GENERAL",
          ...common,
          status: "PENDING",
        },
      });
      if (uploaded.length > 0) {
        await prisma.media.createMany({
          data: uploaded.map((u, i) => ({
            publicId: u.publicId,
            secureUrl: u.url,
            entityType: "REVIEW" as const,
            entityId: reviewId,
            folder: mediaFolder("REVIEW", reviewId),
            role: "CUSTOMER_UPLOAD" as const,
            sortOrder: i,
            width: u.width,
            height: u.height,
          })),
        });
      }
    }
  } catch (e) {
    console.error("Review persist error:", e);
    for (const u of uploaded) await deleteImage(u.publicId).catch(() => {});
    return { error: "Your review could not be saved. Please try again." };
  }

  if (product) await recalcProductRating(product.id);
  if (product) revalidatePath(`/product/${product.slug}`);
  else revalidatePath("/");
  revalidatePath("/admin/reviews");
  return { ok: true, redirectTo: product ? `/product/${product.slug}?rv=submitted` : "/?rv=submitted" };
}

/** A customer deletes their own product review (kept private, not a hard-sell flow). */
export async function deleteOwnReview(formData: FormData): Promise<ReviewSubmitState> {
  const { user, profile } = await getCurrentAuth();
  if (!user || !profile) return { error: "Please sign in." };

  const id = String(formData.get("reviewId") ?? "");
  const review = await prisma.review.findUnique({ where: { id } });
  if (!review || review.profileId !== profile.id || review.type !== "PRODUCT") {
    return { error: "This review does not belong to your account." };
  }

  const media = await prisma.media.findMany({ where: { entityType: "REVIEW", entityId: id }, select: { publicId: true } });
  await prisma.review.delete({ where: { id } });
  await prisma.media.deleteMany({ where: { entityType: "REVIEW", entityId: id } });
  for (const m of media) await deleteImage(m.publicId).catch(() => {});
  if (review.productId) await recalcProductRating(review.productId);

  const slug = review.productSlugSnapshot;
  if (slug) revalidatePath(`/product/${slug}`);
  revalidatePath("/admin/reviews");
  return { ok: true, redirectTo: slug ? `/product/${slug}?rv=deleted` : "/" };
}