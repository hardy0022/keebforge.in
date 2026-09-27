import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuth, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { OrderCard, formatOrderDate } from "@/components/account/OrderCard";
import { ReviewStars } from "@/components/reviews/ReviewStars";
import { DeleteReviewButton } from "@/components/account/DeleteReviewButton";
import type { ReviewStatus } from "@prisma/client";

export const metadata: Metadata = {
  title: "My Orders | KeebForge",
  robots: { index: false, follow: false },
};

async function getOrders(profileId: string) {
  return prisma.order.findMany({
    where: { profileId, isDeleted: false },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      type: true,
      status: true,
      total: true,
      createdAt: true,
      // imageUrl is the product shot snapshotted onto the line at checkout
      // (see src/app/api/payments/create-order/route.ts) — no extra query needed.
      items: { select: { name: true, quantity: true, imageUrl: true } },
      services: { select: { name: true, quantity: true } },
      repairs: { select: { deviceType: true } },
    },
  });
}

async function getReviews(profileId: string) {
  return prisma.review.findMany({
    where: { profileId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      rating: true,
      title: true,
      body: true,
      verified: true,
      status: true,
      createdAt: true,
      productNameSnapshot: true,
      productSlugSnapshot: true,
    },
  });
}

const REVIEW_STATUS_CHIP: Record<ReviewStatus, string> = {
  PENDING: "status-warning",
  APPROVED: "status-success",
  REJECTED: "",
};

const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Published",
  REJECTED: "Rejected",
};

export default async function OrdersPage() {
  const { user } = await getCurrentAuth();
  if (!user) redirect("/auth/login");

  const auth = await requireUser();
  const [orders, reviews] = await Promise.all([
    getOrders(auth.profile.id),
    getReviews(auth.profile.id),
  ]);

  return (
    <div className="account-stack account-stack--tight">
      {/* No section header: the page header above already says "My Orders",
          so a second "Your Orders" block repeated it. */}
      <section className="account-section">
        {orders.length === 0 ? (
          <div className="account-empty account-empty--plain">
            <p className="account-empty-title">No orders yet.</p>
            <p className="account-empty-sub">
              Your completed orders will appear here.
            </p>
            <Link href="/shop" className="btn-prime btn-sm">
              Browse Shop →
            </Link>
          </div>
        ) : (
          <div className="account-order-list">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </section>

      <section className="account-section">
        <header className="account-section-header">
          <div>
            <span className="account-kicker">{"// Your Reviews"}</span>
            <h2 className="account-section-title">Your Reviews</h2>
            <p className="account-section-desc">
              Reviews you&apos;ve submitted and their status
            </p>
          </div>
          <Link href="/write-review" className="account-section-link">
            Write a review
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </header>

        {reviews.length === 0 ? (
          <div className="account-empty account-empty--plain">
            <p className="account-empty-title">No reviews yet.</p>
            <p className="account-empty-sub">
              Reviews you submit will appear here with their status.
            </p>
          </div>
        ) : (
          <div className="account-review-list">
            {reviews.map((review) => (
              <div key={review.id} className="account-review-item">
                <div className="account-review-head">
                  <div>
                    {review.productSlugSnapshot && review.type === "PRODUCT" ? (
                      <Link
                        href={`/product/${review.productSlugSnapshot}`}
                        className="account-review-product is-link"
                      >
                        {review.productNameSnapshot ?? "General review"}
                      </Link>
                    ) : (
                      <span className="account-review-product">
                        {review.productNameSnapshot ?? "General review"}
                      </span>
                    )}
                    <ReviewStars rating={review.rating} />
                  </div>
                  <span
                    className={`account-order-status ${REVIEW_STATUS_CHIP[review.status]}`}
                  >
                    {REVIEW_STATUS_LABELS[review.status]}
                  </span>
                </div>
                {review.verified && (
                  <span className="account-review-verified">
                    ✔ Verified purchase
                  </span>
                )}
                {review.title && (
                  <p className="account-review-title">{review.title}</p>
                )}
                <p className="account-review-body" title={review.body}>
                  {review.body}
                </p>
                <div className="account-review-foot">
                  <p className="account-review-date">
                    {formatOrderDate(review.createdAt)}
                  </p>
                  <DeleteReviewButton reviewId={review.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
