"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteOwnReview } from "@/app/actions/review";

export function DeleteReviewButton({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm("Delete this review? This can't be undone.")) return;
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("reviewId", reviewId);
    const result = await deleteOwnReview(fd);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="account-review-actions">
      <button type="button" className="account-delete-review" onClick={handleDelete} disabled={pending}>
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && <span className="account-delete-error">{error}</span>}
    </div>
  );
}