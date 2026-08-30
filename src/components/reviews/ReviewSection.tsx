import Link from "next/link";
import { getCurrentAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProductReviews, getPublicReviews, getReviewDistribution, getReviewSummary, getSiteReviewSummary, verifiedProfileIds } from "@/lib/reviews";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { ReviewPagination } from "@/components/reviews/ReviewPagination";
import { ReviewSummary } from "@/components/reviews/ReviewSummary";
import { DiaTextReveal } from "@/components/ui/dia-text-reveal";

export type ReviewScope =
  | { type: "site" }
  | { type: "product"; product: { id: string; name: string; slug: string } };

export async function ReviewSection({
  scope,
  page,
  titleReveal = false,
}: {
  scope: ReviewScope;
  page: number;
  titleReveal?: boolean;
}) {
  const data = scope.type === "site" ? await siteReviews(page) : await productReviews(scope.product, page);
  const current = Math.min(page, data.result.pages);

  return (
    <section className="svc-section reviews-section" aria-labelledby="reviews-heading">
      <div className="wrap">
        <div className="product-reviews">
          <header className="product-reviews-head">
            <h2 id="reviews-heading" className="product-section-title">
              {titleReveal ? (
                <DiaTextReveal
                  text="Customer Reviews"
                  textColor="var(--t1)"
                  colors={["#c9f31d", "#eaff6a", "#8ec900"]}
                  duration={1.4}
                />
              ) : (
                "Customer Reviews"
              )}
            </h2>
            <Link href={data.writeHref} className="btn-prime review-write-btn">
              {data.writeLabel} →
            </Link>
          </header>

          {data.summary.count === 0 ? (
            <div className="review-empty">
              <p className="review-empty-title">No reviews yet</p>
              <p className="review-empty-sub">{data.emptySub}</p>
              <Link href={data.writeHref} className="btn-prime">
                {data.writeLabel} →
              </Link>
            </div>
          ) : (
            <>
              <ReviewSummary count={data.summary.count} average={data.summary.average} distribution={data.distribution} />

              <div className="reviews-grid-wrap">
                <p className="reviews-grid-label">Reviews</p>
                <div className="reviews-grid">
                  {data.result.items.map((r) => (
                    <ReviewCard key={r.id} review={r} verified={data.verifiedById.get(r.id) ?? false} />
                  ))}
                </div>

                {data.result.pages > 1 && <ReviewPagination basePath={data.basePath} current={current} pages={data.result.pages} />}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

async function siteReviews(page: number) {
  const [summary, result] = await Promise.all([
    getSiteReviewSummary(),
    // Server-side pagination, 8 per page — only the current page is fetched.
    getPublicReviews({ page }),
  ]);
  const verifiedById = new Map(result.items.map((r) => [r.id, r.verified]));
  return {
    summary,
    distribution: summary.distribution,
    result,
    verifiedById,
    writeHref: "/write-review",
    writeLabel: "Write a Review",
    emptySub: "Share your experience with KeebForge and help others choose with confidence.",
    basePath: "/work",
  };
}

async function productReviews(product: { id: string; name: string; slug: string }, page: number) {
  const [summary, distribution, result, auth] = await Promise.all([
    getReviewSummary(product.id),
    getReviewDistribution(product.id),
    // Server-side pagination, 8 per page — only the current page is fetched.
    getProductReviews(product.id, { page }),
    getCurrentAuth(),
  ]);
  const reviewerProfileIds = result.items.map((r) => r.profile?.id ?? null).filter((p): p is string => !!p);
  const verified = await verifiedProfileIds(product.id, reviewerProfileIds);
  const verifiedById = new Map(
    result.items.map((r) => [r.id, r.verified || (r.profile ? verified.has(r.profile.id) : false)])
  );
  const myReview = auth.profile
    ? await prisma.review.findUnique({
        where: { profileId_productId: { profileId: auth.profile.id, productId: product.id } },
      })
    : null;
  const writeHref = auth.user
    ? `/write-review/${product.slug}`
    : `/auth/login?next=${encodeURIComponent(`/write-review/${product.slug}`)}`;
  return {
    summary,
    distribution,
    result,
    verifiedById,
    writeHref,
    writeLabel: myReview ? "Edit your review" : "Write a Review",
    emptySub: "Be the first to share your experience with this product.",
    basePath: `/product/${product.slug}`,
  };
}