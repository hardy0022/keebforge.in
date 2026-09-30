import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  ReviewComposer,
  type ComposerExisting,
} from "@/components/reviews/ReviewComposer";

export const metadata: Metadata = {
  title: "Edit your review | KeebForge",
  robots: { index: false, follow: false },
};

/**
 * Explicit edit route for the customer's own general (non-product) review.
 * With nothing to edit there is no form to show, so send them to the new-review
 * page rather than rendering an empty "editing" form.
 */
export default async function EditGeneralReviewPage() {
  const { user, profile } = await getCurrentAuth();
  if (!user || !profile) {
    redirect(`/auth/login?next=${encodeURIComponent("/write-review/edit")}`);
  }

  // Unambiguous now: Review_one_general_review_per_profile allows at most one
  // general review per profile, so there is nothing to disambiguate.
  const review = await prisma.review.findFirst({
    where: { profileId: profile.id, type: "GENERAL" },
  });
  if (!review) redirect("/write-review");

  const media = await prisma.media.findMany({
    where: { entityType: "REVIEW", entityId: review.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const existing: ComposerExisting = {
    id: review.id,
    rating: review.rating,
    title: review.title ?? "",
    body: review.body,
    status: review.status,
    images: media.map((m) => ({ id: m.id, url: m.secureUrl })),
  };

  return (
    <ReviewComposer
      mode="edit"
      product={null}
      existing={existing}
      preview={{
        name: profile.name ?? "Customer",
        avatarUrl: profile.avatarUrl ?? null,
      }}
    />
  );
}
