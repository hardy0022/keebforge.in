"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { ReviewStatus } from "@prisma/client";
import { moderateReview } from "@/app/admin/actions/reviews";
import { Spinner } from "@/components/admin/ActionForm";

/**
 * Optimistic moderation buttons: the click flips the row immediately, the
 * server action persists it, and revalidatePath refreshes the list. On failure
 * the display rolls back to the last server-confirmed status.
 */
const BTNS: { status: ReviewStatus; label: string; cls: string }[] = [
  { status: "APPROVED", label: "Approve", cls: " ok" },
  { status: "PENDING", label: "Requeue", cls: "" },
  { status: "REJECTED", label: "Reject", cls: "" },
];

export function ReviewModeration({
  reviewId,
  status,
}: {
  reviewId: string;
  status: ReviewStatus;
}) {
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const act = (next: ReviewStatus) => {
    if (next === optimisticStatus || pending) return;
    setError(null);
    startTransition(async () => {
      setOptimisticStatus(next);
      const res = await moderateReview(reviewId, next);
      if (!res.ok) {
        setOptimisticStatus(status);
        setError(res.error);
      }
    });
  };

  return (
    <>
      {error && <p className="kf-toast err">✕ {error}</p>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {BTNS.map((b) => (
          <button
            key={b.status}
            type="button"
            className={`btn-admin sm${b.cls}`}
            disabled={b.status === optimisticStatus || pending}
            onClick={() => act(b.status)}
          >
            {pending && b.status === optimisticStatus ? <Spinner /> : b.label}
          </button>
        ))}
      </div>
    </>
  );
}
