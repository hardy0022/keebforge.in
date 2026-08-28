import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProductBySlug } from "@/lib/data";
import { ReviewForm } from "@/components/reviews/ReviewForm";

export const metadata: Metadata = {
  title: "Write a review | KeebForge",
  robots: { index: false, follow: false },
};

export default async function WriteReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, profile } = await getCurrentAuth();
  if (!user || !profile) {
    redirect(`/auth/login?next=${encodeURIComponent(`/write-review/${slug}`)}`);
  }

  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const existing = await prisma.review.findUnique({
    where: { profileId_productId: { profileId: profile.id, productId: product.id } },
  });
  const editReview = existing?.type === "PRODUCT" ? existing : null;
  const reviewMedia = editReview
    ? await prisma.media.findMany({
        where: { entityType: "REVIEW", entityId: editReview.id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      })
    : [];

  return (
    <main className="product-page">
      <div className="wrap page-start">
        <div className="write-review">
          <header className="write-review-head">
            <h1 className="product-title">{editReview ? "Edit your review" : "Write a Review"}</h1>
            <p className="write-review-sub">Share your experience with this product.</p>
            {editReview && (
              <p className="review-status-note">
                {editReview.status === "APPROVED"
                  ? "Your published review is shown below — edits re-enter moderation."
                  : editReview.status === "REJECTED"
                    ? "Your previous review needs changes before it can be published."
                    : "Your review is awaiting moderation — you can still update it."}
              </p>
            )}
          </header>

          <div className="write-review-product-card">
            {product.images[0] && (
              <img src={product.images[0].url} alt="" width={84} height={53} className="write-review-thumb" />
            )}
            <div className="write-review-product-meta">
              <span className="write-review-product-cat">
                {product.category.name}
                {product.brand ? ` · ${product.brand.name}` : ""}
              </span>
              <span className="write-review-product-name">{product.name}</span>
            </div>
          </div>

          <ReviewForm
            product={{
              id: product.id,
              name: product.name,
              slug: product.slug,
              image: product.images[0]?.url ?? null,
              category: product.category.name,
              brand: product.brand?.name ?? null,
            }}
            existing={
              editReview
                ? {
                    id: editReview.id,
                    rating: editReview.rating,
                    title: editReview.title ?? "",
                    body: editReview.body,
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