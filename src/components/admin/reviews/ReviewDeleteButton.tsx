"use client";

import { deleteReviewAsAdmin } from "@/app/admin/actions/reviews";

/** Confirm-gated admin delete for a review (server actions can't take onClick). */
export function ReviewDeleteButton({ reviewId }: { reviewId: string }) {
  return (
    <form action={deleteReviewAsAdmin.bind(null, reviewId)}>
      <button
        type="submit"
        className="btn-admin sm err"
        onClick={(e) => {
          if (!window.confirm("Delete this review permanently (with its photos)?")) e.preventDefault();
        }}
      >
        Delete
      </button>
    </form>
  );
}