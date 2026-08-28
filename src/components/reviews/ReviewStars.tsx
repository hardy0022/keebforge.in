/**
 * Star row for ratings, sized to the glyph so fractional ratings (e.g. 4.5)
 * render as a partially-filled last star rather than pretending it's 5.
 * Filled layer is clipped to (rating / 5) width over a muted ☆ base.
 */
export function ReviewStars({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" | "lg" }) {
  const clamped = Math.max(0, Math.min(5, rating));
  const pct = (clamped / 5) * 100;
  const value = Math.round(clamped * 10) / 10;
  return (
    <span className={`review-stars review-stars-${size}`} role="img" aria-label={`${value} out of 5 stars`}>
      <span className="stars-base" aria-hidden="true">
        ☆☆☆☆☆
      </span>
      <span className="stars-fill" style={{ width: `${pct}%` }} aria-hidden="true">
        ★★★★★
      </span>
    </span>
  );
}