/**
 * Route-loading and Suspense skeletons. Reuse the real layout classes so the
 * placeholder occupies the exact same box as the finished content (no layout
 * shift when it swaps in). Pure server components — the shimmer animation is
 * CSS (`.sk`) and is disabled for prefers-reduced-motion.
 */

const SK = "sk";

function CardSkeleton() {
  return (
    <article className="shop-card" aria-hidden="true">
      <div className="shop-card-media">
        <div className={SK} style={{ width: "100%", height: "100%" }} />
      </div>
      <div className="shop-card-body">
        <div className={SK} style={{ width: "70%", height: 14 }} />
        <div className={SK} style={{ width: "45%", height: 22 }} />
      </div>
    </article>
  );
}

export function ReviewSectionSkeleton() {
  return (
    <section className="svc-section" aria-hidden="true">
      <div className="wrap">
        <div
          className={SK}
          style={{ width: 300, height: 20, marginBottom: 18 }}
        />
        <div
          className="reviews-grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {Array.from({ length: 3 }, (_, i) => (
            <div className="review-card" key={i}>
              <div
                className={SK}
                style={{ width: "75%", height: 16, margin: "18px 18px 10px" }}
              />
              <div
                className={SK}
                style={{ width: "90%", height: 12, margin: "0 18px 8px" }}
              />
              <div
                className={SK}
                style={{ width: "85%", height: 12, margin: "0 18px 16px" }}
              />
              <div
                className={SK}
                style={{ width: "60%", height: 11, margin: "0 18px 18px" }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RelatedProductsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <section className="svc-section" aria-hidden="true">
      <div className="wrap">
        <div
          className={SK}
          style={{ width: 240, height: 20, marginBottom: 18 }}
        />
        <div className="shop-grid">
          {Array.from({ length: count }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
