import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getProductBySlug } from "@/lib/catalog/data";
import {
  ReviewComposer,
  type ComposerExisting,
} from "@/components/reviews/ReviewComposer";

export const metadata: Metadata = {
  title: "Edit your review | KeebForge",
  robots: { index: false, follow: false },
};

/**
 * Explicit edit route for the customer's own review of this product. The lookup
 * is keyed on the signed-in profile as well as the product, so a crafted slug
 * can only ever surface the requester's own review — never someone else's.
 */
export default async function EditProductReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, profile } = await getCurrentAuth();
  if (!user || !profile) {
    redirect(
      `/auth/login?next=${encodeURIComponent(`/write-review/${slug}/edit`)}`,
    );
  }

  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const review = await prisma.review.findUnique({
    where: {
      profileId_productId: { profileId: profile.id, productId: product.id },
    },
  });
  if (!review || review.type !== "PRODUCT") redirect(`/product/${product.slug}`);

  const media = await prisma.media.findMany({
    where: { entityType: "REVIEW", entityId: review.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const existing: ComposerExisting = {
    id: review.id,
    rating: review.rating,
    title: review.title ?? "",
    body: review.body,
    status: review.status,
    images: media.map((m) => ({ id: m.id, url: m.secureUrl })),
  };

  return (
    <ReviewComposer
      mode="edit"
      product={{
        id: product.id,
        name: product.name,
        slug: product.slug,
        image: product.images[0]?.url ?? null,
        category: product.category.name,
        brand: product.brand?.name ?? null,
      }}
      existing={existing}
      preview={{
        name: profile.name ?? "Customer",
        avatarUrl: profile.avatarUrl ?? null,
      }}
    />
  );
}
