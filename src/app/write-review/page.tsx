import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAuth } from "@/lib/auth/session";
import { ReviewComposer } from "@/components/reviews/ReviewComposer";

export const metadata: Metadata = {
  title: "Write a review | KeebForge",
  robots: { index: false, follow: false },
};

/** Always a NEW review. Editing a general review lives at /write-review/edit. */
export default async function WriteGeneralReviewPage() {
  const { user, profile } = await getCurrentAuth();
  if (!user || !profile) {
    redirect(`/auth/login?next=${encodeURIComponent("/write-review")}`);
  }

  return (
    <ReviewComposer
      mode="create"
      product={null}
      existing={null}
      preview={{
        name: profile.name ?? "Customer",
        avatarUrl: profile.avatarUrl ?? null,
      }}
    />
  );
}
