import { ReviewStars } from "@/components/reviews/ReviewStars";

/** The two-column rating summary (big average + 5★ bar distribution). */
export function ReviewSummary({
  count,
  average,
  distribution,
}: {
  count: number;
  average: number | null;
  distribution: number[];
}) {
  return (
    <div className="reviews-summary">
      <div className="reviews-summary-avg">
        <div className="reviews-summary-avg-main">
          <span className="reviews-avg-num">{Number((average ?? 0).toFixed(1)).toString()}</span>
          <span className="reviews-avg-label">out of 5</span>
        </div>
        <ReviewStars rating={average ?? 0} size="lg" />
        <p className="reviews-based">
          Based on {count} {count === 1 ? "review" : "reviews"}
        </p>
      </div>

      <div className="reviews-summary-stats">
        <div className="reviews-dist">
          {distribution.map((n, i) => {
            const stars = 5 - i;
            const pct = count > 0 ? (n / count) * 100 : 0;
            return (
              <div key={stars} className="reviews-dist-row">
                <span className="reviews-dist-label">{stars}★</span>
                <span className="reviews-dist-bar">
                  <span className="reviews-dist-fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="reviews-dist-count num">{n}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}