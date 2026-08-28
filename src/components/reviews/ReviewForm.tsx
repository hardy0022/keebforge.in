"use client";

import { useActionState, useRef, useState, type ReactElement } from "react";
import Link from "next/link";
import { submitReview, type ReviewSubmitState } from "@/app/actions/review";
import { sniffImageFile, IMAGE_ACCEPT, IMAGE_TYPES_MESSAGE } from "@/lib/image-validation";
import { ReviewStars } from "./ReviewStars";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TITLE_MAX_CHARS = 30;

type NewPhoto = { uid: string; url: string; file: File };

export function ReviewForm({
  product,
  existing,
  preview,
}: {
  product: { id: string; name: string; slug: string; image: string | null; category: string; brand: string | null } | null;
  existing: { id: string; rating: number; title: string; body: string; images: { id: string; url: string }[] } | null;
  preview: { name: string; avatarUrl: string | null };
}) {
  const [state, formAction, pending] = useActionState<ReviewSubmitState, FormData>(submitReview, {});
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [newPhotos, setNewPhotos] = useState<NewPhoto[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (state.ok && state.redirectTo) {
      router.push(state.redirectTo);
      router.refresh();
    }
  }, [state.ok, state.redirectTo, router]);

  const keptExisting = (existing?.images ?? []).filter((m) => !removed.has(m.id));
  const previewPhotos: { key: string; url: string }[] = [
    ...keptExisting.map((m) => ({ key: m.id, url: m.url })),
    ...newPhotos.map((p) => ({ key: p.uid, url: p.url })),
  ];

  async function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const room = Math.max(0, MAX_IMAGES - keptExisting.length - newPhotos.length);
    const accepted: NewPhoto[] = [];
    for (const f of files.slice(0, room)) {
      if (f.size > MAX_IMAGE_BYTES) {
        alert(`Each photo must be under 5 MB — "${f.name}" is too large.`);
        continue;
      }
      if (!(await sniffImageFile(f))) {
        alert(`${IMAGE_TYPES_MESSAGE} ("${f.name}" isn't one.)`);
        continue;
      }
      accepted.push({ uid: `${f.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`, url: URL.createObjectURL(f), file: f });
    }
    if (accepted.length < files.length) alert(`You can attach at most ${MAX_IMAGES} photos.`);
    setNewPhotos((prev) => [...prev, ...accepted]);
    e.target.value = "";
  }

  function dropNewPhoto(uid: string) {
    setNewPhotos((prev) => {
      const target = prev.find((p) => p.uid === uid);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.uid !== uid);
    });
  }

  function toggleRemove(id: string) {
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    for (const p of newPhotos) fd.append("images", p.file);
    formAction(fd);
  }

  return (
    <div className="write-review-grid">
      <div className="write-review-main">
        <form action={formAction} onSubmit={onSubmit} className="review-form write-review-form">
          {product && <input type="hidden" name="slug" value={product.slug} />}
          <section className="write-review-field">
            <span className="write-review-label">Your rating</span>
            <RatingPicker value={rating} onChange={setRating} />
            <input type="hidden" name="rating" value={rating} />
          </section>

          <section className="write-review-field">
            <label className="write-review-label" htmlFor="wr-title">
              Review title
            </label>
            <input
              id="wr-title"
              name="title"
              type="text"
              className="write-review-input"
              maxLength={TITLE_MAX_CHARS}
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX_CHARS))}
              placeholder="What did you think?"
            />
          </section>

          <section className="write-review-field">
            <label className="write-review-label" htmlFor="wr-body">
              Your review
            </label>
            <textarea
              id="wr-body"
              name="body"
              rows={9}
              className="write-review-textarea"
              minLength={10}
              maxLength={2000}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Tell us about your experience…"
            />
            <p className="field-hint">Minimum 10 characters · be honest, help fellow builders.</p>
          </section>

          <section className="write-review-field">
            <span className="write-review-label">Photos</span>
            <p className="write-review-photo-hint">Add photos of your product or setup</p>
            <div className="wr-photo-grid">
              {keptExisting.map((m) => (
                <div key={m.id} className="wr-photo">
                  <img src={m.url} alt="" loading="lazy" width={120} height={90} />
                  <button type="button" className="wr-photo-x" onClick={() => toggleRemove(m.id)} aria-label="Remove photo">
                    ×
                  </button>
                  <input
                    type="checkbox"
                    name="removeMedia"
                    value={m.id}
                    checked={removed.has(m.id)}
                    onChange={() => toggleRemove(m.id)}
                    className="sr-only"
                  />
                </div>
              ))}
              {newPhotos.map((p) => (
                <div key={p.uid} className="wr-photo">
                  <img src={p.url} alt="" width={120} height={90} />
                  <button type="button" className="wr-photo-x" onClick={() => dropNewPhoto(p.uid)} aria-label="Remove photo">
                    ×
                  </button>
                </div>
              ))}
              {keptExisting.length + newPhotos.length < MAX_IMAGES && (
                <label className="wr-photo-add">
                  <input
                    type="file"
                    accept={IMAGE_ACCEPT.join(",")}
                    multiple
                    onChange={onFilesChange}
                    className="sr-only"
                  />
                  <span className="wr-photo-add-icon">+</span>
                  <span>Add Photos</span>
                </label>
              )}
            </div>
            <p className="field-hint">
              PNG / JPG / WebP / AVIF · Up to {MAX_IMAGES} photos · Max 5 MB each
            </p>
          </section>

          {state.error && (
            <p className="auth-error" role="alert">
              {state.error}
            </p>
          )}

          <div className="write-review-actions">
            <Link href={product ? `/product/${product.slug}` : "/"} className="btn-ghost write-review-cancel">
              Cancel
            </Link>
            <button type="submit" className="btn-prime write-review-submit" disabled={pending}>
              {pending ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  {existing ? "Saving…" : "Submitting…"}
                </>
              ) : existing ? (
                <>
                  Save Changes <span aria-hidden="true">→</span>
                </>
              ) : (
                <>
                  Submit Review <span aria-hidden="true">→</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <aside className="write-review-side" aria-label="Review preview">
        <div className="review-preview-card">
          <div className="review-preview-product">
            {product?.image ? (
              <img src={product.image} alt="" width={56} height={36} className="review-preview-thumb" />
            ) : (
              <span className="review-preview-thumb review-preview-thumb-empty" aria-hidden="true" />
            )}
            <div className="review-preview-product-meta">
              <span className="review-preview-cat">
                {product
                  ? `${product.category}${product.brand ? ` · ${product.brand}` : ""}`
                  : "KeebForge"}
              </span>
              <span className="review-preview-name">
                {product ? product.name : "General review"}
              </span>
            </div>
          </div>

          <div className="review-preview-divider" />

          <p className="review-preview-label">Review Preview</p>
          <article className="review-card product-review-card preview-review-card">
            <div className="review-card-head">
              <h3 className="review-card-title">{title || "Your review title"}</h3>
              <ReviewStars rating={rating} />
            </div>
            <p className="review-text">{body || "Your review text will appear here…"}</p>
            {previewPhotos.length > 0 && (
              <div className="review-photos">
                {previewPhotos.slice(0, 4).map((p) => (
                  <span key={p.key} className="review-photo">
                    <img src={p.url} alt="" loading="lazy" />
                  </span>
                ))}
                {previewPhotos.length > 4 && (
                  <span className="review-photo review-photo-more" aria-hidden="true">
                    +{previewPhotos.length - 4}
                  </span>
                )}
              </div>
            )}
            <footer className="review-footer">
              <div className="review-author">
                {preview.avatarUrl ? (
                  <span className="review-avatar">
                    <img src={preview.avatarUrl} alt="" />
                  </span>
                ) : (
                  <span className="review-avatar" aria-hidden="true">
                    {(preview.name || "U").charAt(0)}
                  </span>
                )}
                <div className="review-author-meta">
                  <div className="review-name">{preview.name || "Your name"}</div>
                  {rating > 0 && (
                    <span className="review-verified" title="Preview — verified purchase">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      Verified Purchase
                    </span>
                  )}
                </div>
              </div>
              <div className="review-meta-right">
                <time className="review-date">Just now</time>
              </div>
            </footer>
          </article>
        </div>
      </aside>
    </div>
  );
}

/** Large interactive 1–5 star selector with hover feedback + "N out of 5" indicator. */
function RatingPicker({ value, onChange }: { value: number; onChange: (n: number) => void }): ReactElement {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  return (
    <div className="rating-picker-wrap">
      <div className="rating-picker" role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`rating-picker-star${n <= active ? " is-on" : ""}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => onChange(n)}
            aria-label={`${n} out of 5 stars`}
            aria-pressed={n === value}
            tabIndex={0}
          >
            ★
          </button>
        ))}
      </div>
      <span className="rating-picker-hint" aria-live="polite">
        {value > 0 ? `${value} out of 5` : "Tap the stars to rate"}
      </span>
    </div>
  );
}