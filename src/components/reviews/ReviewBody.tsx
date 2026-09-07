"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { ReviewStars } from "@/components/reviews/ReviewStars";
import { cldUrl } from "@/lib/images/cloudinary-url";
import type { ReviewCardItem } from "@/components/reviews/ReviewCard";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ReviewBody({ review }: { review: ReviewCardItem }) {
  const [open, setOpen] = useState(false);
  const [clickable, setClickable] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const checkOverflow = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    el.classList.add("review-text-full");
    const full = el.scrollHeight;
    el.classList.remove("review-text-full");

    requestAnimationFrame(() => {
      const collapsed = el.scrollHeight;
      setClickable(full > collapsed + 1);
    });
  }, []);

  useEffect(() => {
    checkOverflow();
  }, [checkOverflow, review.body]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <div
        className={`review-body${clickable ? " review-body-clickable" : ""}`}
      >
        <div ref={ref} className="review-text">
          {review.body}
        </div>
        {clickable && (
          <button
            type="button"
            className="review-see-more"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-label="See full review"
          >
            See more →
          </button>
        )}
      </div>

      <dialog
        ref={dialogRef}
        className="review-text-dialog"
        aria-label="Full review"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setOpen(false);
        }}
      >
        <div className="review-modal">
          <button
            type="button"
            className="review-modal-close"
            onClick={() => setOpen(false)}
            aria-label="Close review"
          >
            ×
          </button>

          <div className="review-modal-top">
            {review.rating > 0 && (
              <div className="review-modal-stars">
                <ReviewStars rating={review.rating} />
              </div>
            )}
            {review.title && (
              <h3 className="review-modal-title">{review.title}</h3>
            )}
          </div>

          <div className="review-modal-scroll">
            <div className="review-modal-body">{review.body}</div>

            {review.images.length > 0 && (
              <div className="review-modal-photos">
                {review.images.map((img) => (
                  <a
                    key={img.id}
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="review-modal-photo"
                  >
                    <img src={cldUrl(img.url, 1600)} alt="" loading="lazy" />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="review-modal-foot">
            <div className="review-modal-author">
              {review.profile?.avatarUrl ? (
                <span className="review-avatar">
                  <img src={review.profile.avatarUrl} alt="" />
                </span>
              ) : (
                <span className="review-avatar" aria-hidden="true">
                  {(
                    review.profile?.name?.trim() ||
                    review.authorName?.trim() ||
                    "?"
                  ).charAt(0)}
                </span>
              )}
              <div className="review-author-meta">
                <div className="review-name">
                  {review.profile?.name?.trim() ||
                    review.authorName?.trim() ||
                    "Verified customer"}
                </div>
                {review.verified && (
                  <span className="review-verified">Verified Purchase</span>
                )}
                {review.authorLocation && (
                  <div className="review-location">{review.authorLocation}</div>
                )}
              </div>
            </div>
            <time
              className="review-date"
              dateTime={review.createdAt.toISOString()}
            >
              {formatDate(review.createdAt)}
            </time>
          </div>
        </div>
      </dialog>
    </>
  );
}
