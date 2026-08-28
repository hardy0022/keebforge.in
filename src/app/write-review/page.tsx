import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReviewForm } from "@/components/reviews/ReviewForm";

export const metadata: Metadata = {
  title: "Write a review | KeebForge",
  robots: { index: false, follow: false },
};

export default async function WriteGeneralReviewPage() {
  const { user, profile } = await getCurrentAuth();
  if (!user || !profile) {
    redirect(`/auth/login?next=${encodeURIComponent("/write-review")}`);
  }

  const existing = await prisma.review.findFirst({
    where: { profileId: profile.id, type: "GENERAL" },
    orderBy: { createdAt: "desc" },
  });
  const reviewMedia = existing
    ? await prisma.media.findMany({
        where: { entityType: "REVIEW", entityId: existing.id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      })
    : [];

  return (
    <main className="product-page">
      <div className="wrap page-start">
        <div className="write-review">
          <header className="write-review-head">
            <h1 className="product-title">{existing ? "Edit your review" : "Write a Review"}</h1>
            <p className="write-review-sub">Share your experience with KeebForge.</p>
            {existing && (
              <p className="review-status-note">
                {existing.status === "APPROVED"
                  ? "Your published review is shown below — edits re-enter moderation."
                  : existing.status === "REJECTED"
                    ? "Your previous review needs changes before it can be published."
                    : "Your review is awaiting moderation — you can still update it."}
              </p>
            )}
          </header>

          <ReviewForm
            product={null}
            existing={
              existing
                ? {
                    id: existing.id,
                    rating: existing.rating,
                    title: existing.title ?? "",
                    body: existing.body,
                    images: reviewMedia.map((m) => ({ id: m.id, url: m.secureUrl })),
                  }
                : null
            }
            preview={{ name: profile.name ?? "Customer", avatarUrl: profile.avatarUrl ?? null }}
          />
        </div>
      </div>
    </main>
  );
}