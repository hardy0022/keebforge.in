import type { ReactNode } from "react";
import { cldUrl } from "@/lib/images/cloudinary-url";
import { ReviewForm } from "./ReviewForm";

export type ComposerProduct = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  category: string;
  brand: string | null;
};

export type ComposerExisting = {
  id: string;
  rating: number;
  title: string;
  body: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  images: { id: string; url: string }[];
};

/**
 * Shared shell for every review route, so the create routes and the edit routes
 * can never drift apart visually. `mode` is the single source of truth for
 * whether the submission creates or updates — it is forwarded to the form and
 * re-declared server-side, never inferred from `existing`.
 */
export function ReviewComposer({
  mode,
  product,
  existing,
  preview,
  notice,
}: {
  mode: "create" | "edit";
  product: ComposerProduct | null;
  existing: ComposerExisting | null;
  preview: { name: string; avatarUrl: string | null };
  /** Optional note above the form, e.g. "you already reviewed this product". */
  notice?: ReactNode;
}) {
  const editing = mode === "edit";

  return (
    <main className="product-page">
      <div className="wrap page-start">
        <div className="write-review">
          <header className="write-review-head">
            <h1 className="product-title">
              {editing ? "Edit your review" : "Write a Review"}
            </h1>
            <p className="write-review-sub">
              {editing
                ? product
                  ? "Update your experience with this product."
                  : "Update your experience with KeebForge."
                : product
                  ? "Share your experience with this product."
                  : "Share your experience with KeebForge."}
            </p>
            {editing && existing && (
              <p className="review-status-note">
                {existing.status === "APPROVED"
                  ? "Your published review is shown below — edits re-enter moderation."
                  : existing.status === "REJECTED"
                    ? "Your previous review needs changes before it can be published."
                    : "Your review is awaiting moderation — you can still update it."}
              </p>
            )}
            {!editing && notice && (
              <p className="review-status-note">{notice}</p>
            )}
          </header>

          {product && (
            <div className="write-review-product-card">
              {product.image && (
                <img
                  src={cldUrl(product.image, 168)}
                  alt=""
                  width={84}
                  height={53}
                  className="write-review-thumb"
                />
              )}
              <div className="write-review-product-meta">
                <span className="write-review-product-cat">
                  {product.category}
                  {product.brand ? ` · ${product.brand}` : ""}
                </span>
                <span className="write-review-product-name">
                  {product.name}
                </span>
              </div>
            </div>
          )}

          <ReviewForm
            mode={mode}
            product={product}
            existing={
              editing && existing
                ? {
                    id: existing.id,
                    rating: existing.rating,
                    title: existing.title,
                    body: existing.body,
                    images: existing.images,
                  }
                : null
            }
            preview={preview}
          />
        </div>
      </div>
    </main>
  );
}
