import Link from "next/link";
import { getCurrentAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProductReviews, getReviewDistribution, getReviewSummary, verifiedProfileIds } from "@/lib/reviews";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { ReviewPagination } from "@/components/reviews/ReviewPagination";
import { ReviewSummary } from "@/components/reviews/ReviewSummary";

export async function ReviewSection({ product, page }: { product: { id: string; name: string; slug: string }; page: number }) {
  const [summary, distribution, result, auth] = await Promise.all([
    getReviewSummary(product.id),
    getReviewDistribution(product.id),
    // Server-side pagination, 8 per page — only the current page is fetched.
    getProductReviews(product.id, { page }),
    getCurrentAuth(),
  ]);
  const reviewerProfileIds = result.items.map((r) => r.profile?.id ?? null).filter((p): p is string => !!p);
  const verified = await verifiedProfileIds(product.id, reviewerProfileIds);
  const current = Math.min(page, result.pages);

  const myReview = auth.profile
    ? await prisma.review.findUnique({
        where: { profileId_productId: { profileId: auth.profile.id, productId: product.id } },
      })
    : null;

  const writeHref = auth.user
    ? `/write-review/${product.slug}`
    : `/auth/login?next=${encodeURIComponent(`/write-review/${product.slug}`)}`;
  const writeLabel = myReview ? "Edit your review" : "Write a Review";

  return (
    <section className="svc-section reviews-section" aria-labelledby="reviews-heading">
      <div className="wrap">
        <div className="product-reviews">
          <header className="product-reviews-head">
            <h2 id="reviews-heading" className="product-section-title">
              Customer Reviews
            </h2>
            <Link href={writeHref} className="btn-prime review-write-btn">
              {writeLabel} →
            </Link>
          </header>

          {summary.count === 0 ? (
            <div className="review-empty">
              <p className="review-empty-title">No reviews yet</p>
              <p className="review-empty-sub">Be the first to share your experience with this product.</p>
              <Link href={writeHref} className="btn-prime">
                {myReview ? "Edit your review" : "Write a Review"} →
              </Link>
            </div>
          ) : (
            <>
              <ReviewSummary count={summary.count} average={summary.average} distribution={distribution} />

              <div className="reviews-grid-wrap">
                <p className="reviews-grid-label">Reviews</p>
                <div className="reviews-grid">
                  {result.items.map((r) => (
                    <ReviewCard key={r.id} review={r} verified={r.verified || (r.profile ? verified.has(r.profile.id) : false)} />
                  ))}
                </div>

                {result.pages > 1 && <ReviewPagination basePath={`/product/${product.slug}`} current={current} pages={result.pages} />}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}