import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuth, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatINR } from "@/lib/utils/money";
import {
  ORDER_STATUS_CHIP,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
} from "@/lib/orders";
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
      items: { select: { name: true, quantity: true } },
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

  const formatDate = (d: Date) =>
    new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="account-stack">
      <section className="account-section">
        {orders.length === 0 ? (
          <div className="account-empty">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <h3>No orders yet</h3>
            <p>When you place an order, it will appear here.</p>
            <Link href="/shop" className="btn-prime">
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="account-order-list">
            {orders.map((order) => {
              const preview = [
                ...order.items
                  .slice(0, 2)
                  .map(
                    (i) =>
                      `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`,
                  ),
                ...order.services
                  .slice(0, 2)
                  .map(
                    (s) =>
                      `${s.name}${s.quantity > 1 ? ` ×${s.quantity}` : ""}`,
                  ),
                ...order.repairs
                  .slice(0, 1)
                  .map((r) => `${r.deviceType} Repair`),
              ];
              const extra =
                order.items.length +
                order.services.length +
                order.repairs.length -
                preview.length;

              return (
                <div
                  key={order.id}
                  className="account-order-item account-order-item--grid"
                >
                  <div className="account-order-info">
                    <div className="account-order-header">
                      <Link
                        href={`/order/success/${order.orderNumber}`}
                        className="account-order-number is-link"
                      >
                        {order.orderNumber}
                      </Link>
                      <span className="account-order-type">
                        {ORDER_TYPE_LABELS[order.type]}
                      </span>
                    </div>
                    <div className="account-order-meta">
                      <span className="account-order-date">
                        {new Date(order.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="account-order-items-preview">
                    {preview.map((line, i) => (
                      <span key={i} className="account-order-item-name">
                        {line}
                      </span>
                    ))}
                    {extra > 0 && (
                      <span className="account-order-more">+{extra} more</span>
                    )}
                  </div>

                  <div className="account-order-total">
                    {formatINR(order.total)}
                  </div>

                  <span
                    className={`account-order-status ${ORDER_STATUS_CHIP[order.status]}`}
                  >
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>

                  <div className="account-order-actions">
                    <Link
                      href={`/order/success/${order.orderNumber}`}
                      className="btn-ghost btn-sm"
                    >
                      Summary
                    </Link>
                    <Link
                      href={`/track-order?order=${order.orderNumber}`}
                      className="btn-prime btn-sm"
                    >
                      Track
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="account-section">
        <header className="account-section-header">
          <div>
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
          <div className="account-empty">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <h3>No reviews yet</h3>
            <p>Reviews you submit will appear here with their status.</p>
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
                <p className="account-review-body">{review.body}</p>
                <div className="account-review-foot">
                  <p className="account-review-date">
                    {formatDate(review.createdAt)}
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
