import { ReviewStars } from "@/components/reviews/ReviewStars";

/** Photos shown per review before the "+N more" tile takes over. */
const PHOTOS_SHOWN = 4;

export type ReviewCardItem = {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  createdAt: Date;
  verified: boolean;
  authorName: string | null;
  authorLocation: string | null;
  images: { id: string; url: string }[];
  profile: { name: string | null; avatarUrl: string | null } | null;
};

function authorName(profileName: string | null, fallback: string | null): string {
  const name = profileName?.trim() || fallback?.trim() || "";
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.length > 2 ? parts.slice(0, 2).join(" ") : name || "Verified customer";
}

/** A single review card, shared by the product review grid and the /work feed. */
export function ReviewCard({ review, verified }: { review: ReviewCardItem; verified: boolean }) {
  const name = authorName(review.profile?.name ?? null, review.authorName);
  const morePhotos = review.images.length - PHOTOS_SHOWN;
  const shownPhotos =
    morePhotos > 0 ? review.images.slice(0, PHOTOS_SHOWN - 1) : review.images.slice(0, PHOTOS_SHOWN);

  return (
    <article className="review-card product-review-card">
      <div className="review-card-head">
        {review.title && <h3 className="review-card-title">{review.title}</h3>}
        <ReviewStars rating={review.rating} />
      </div>
      <p className="review-text">{review.body}</p>
      {shownPhotos.length > 0 && (
        <div className="review-photos">
          {shownPhotos.map((img) => (
            <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer" className="review-photo">
              <img src={img.url} alt="" loading="lazy" />
            </a>
          ))}
          {morePhotos > 0 && (
            <a
              href={review.images[PHOTOS_SHOWN - 1].url}
              target="_blank"
              rel="noopener noreferrer"
              className="review-photo review-photo-more"
              aria-label={`View ${morePhotos} more photos`}
            >
              <span>+{morePhotos}</span>
            </a>
          )}
        </div>
      )}
      <footer className="review-footer">
        <div className="review-author">
          {review.profile?.avatarUrl ? (
            <span className="review-avatar">
              <img src={review.profile.avatarUrl} alt="" />
            </span>
          ) : (
            <span className="review-avatar" aria-hidden="true">
              {name.charAt(0)}
            </span>
          )}
          <div className="review-author-meta">
            <div className="review-name">{name}</div>
            {verified && (
              <span className="review-verified" title="Verified purchase">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Verified Purchase
              </span>
            )}
            {review.authorLocation && <div className="review-location">{review.authorLocation}</div>}
          </div>
        </div>
        <div className="review-meta-right">
          <time className="review-date" dateTime={review.createdAt.toISOString()}>
            {review.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </time>
        </div>
      </footer>
    </article>
  );
}