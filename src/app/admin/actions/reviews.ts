"use server";

import { revalidatePath } from "next/cache";
import type { ReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/admin";
import { deleteImage } from "@/lib/cloudinary";
import { recalcProductRating } from "@/lib/reviews";

/** Moderator sets a review's moderation status. */
export async function moderateReview(reviewId: string, status: ReviewStatus) {
  await requirePermission("product", "view");
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) return;
  await prisma.review.update({ where: { id: reviewId }, data: { status } });
  if (review.productId) await recalcProductRating(review.productId);
  revalidatePath("/admin/reviews");
  if (review.productSlugSnapshot) revalidatePath(`/product/${review.productSlugSnapshot}`);
}

/** Admin hard-deletes a review (with its photos). */
export async function deleteReviewAsAdmin(reviewId: string) {
  await requirePermission("product", "view");
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) return;
  const media = await prisma.media.findMany({
    where: { entityType: "REVIEW", entityId: reviewId },
    select: { publicId: true },
  });
  await prisma.review.delete({ where: { id: reviewId } });
  await prisma.media.deleteMany({ where: { entityType: "REVIEW", entityId: reviewId } });
  for (const m of media) await deleteImage(m.publicId).catch(() => {});
  if (review.productId) await recalcProductRating(review.productId);
  revalidatePath("/admin/reviews");
  if (review.productSlugSnapshot) revalidatePath(`/product/${review.productSlugSnapshot}`);
}