import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getProductBySlug } from "@/lib/catalog/data";
import { ReviewComposer } from "@/components/reviews/ReviewComposer";

export const metadata: Metadata = {
  title: "Write a review | KeebForge",
  robots: { index: false, follow: false },
};

/**
 * Always a NEW review for this product. The form stays empty even when the
 * customer already reviewed it — the server rejects a second product review
 * (one per customer per product), and /write-review/[slug]/edit is the way to
 * change an existing one. Only the notice below reads the stored review.
 */
export default async function WriteReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, profile } = await getCurrentAuth();
  if (!user || !profile) {
    redirect(`/auth/login?next=${encodeURIComponent(`/write-review/${slug}`)}`);
  }

  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const mine = await prisma.review.findUnique({
    where: {
      profileId_productId: { profileId: profile.id, productId: product.id },
    },
    select: { id: true },
  });

  return (
    <ReviewComposer
      mode="create"
      product={{
        id: product.id,
        name: product.name,
        slug: product.slug,
        image: product.images[0]?.url ?? null,
        category: product.category.name,
        brand: product.brand?.name ?? null,
      }}
      existing={null}
      notice={
        mine ? (
          <>
            You already reviewed this product —{" "}
            <Link
              href={`/write-review/${product.slug}/edit`}
              className="account-section-link"
            >
              edit your existing review
            </Link>{" "}
            instead.
          </>
        ) : undefined
      }
      preview={{
        name: profile.name ?? "Customer",
        avatarUrl: profile.avatarUrl ?? null,
      }}
    />
  );
}
