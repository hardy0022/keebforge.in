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

/** Route-loading skeleton for the shop + category listing pages. */
export function ShopLoadingSkeleton() {
  return (
    <main className="shop-page">
      <section className="shop-hero">
        <div className="wrap">
          <span className={SK} style={{ width: 64, height: 12 }} />
          <div
            className={SK}
            style={{ width: "min(480px, 80%)", height: 40, marginTop: 16 }}
          />
          <div
            className={SK}
            style={{ width: "min(640px, 92%)", height: 14, marginTop: 16 }}
          />
          <div
            className={SK}
            style={{ width: "min(520px, 80%)", height: 14, marginTop: 8 }}
          />
        </div>
      </section>
      <section className="svc-section" aria-hidden="true">
        <div className="wrap">
          <div
            className={SK}
            style={{ width: 140, height: 14, marginBottom: 20 }}
          />
          <div className="shop-grid">
            {Array.from({ length: 9 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

/** Route-loading skeleton for the product detail page. */
export function ProductLoadingSkeleton() {
  return (
    <main className="product-page">
      <div className="wrap page-start">
        <div className={SK} style={{ width: 240, height: 14 }} />
      </div>
      <section className="svc-section" aria-hidden="true">
        <div className="wrap">
          <div className="product-layout">
            <div className="product-gallery-column">
              <div
                className={SK}
                style={{
                  width: "100%",
                  aspectRatio: "4/3",
                  borderRadius: "var(--r-lg)",
                }}
              />
            </div>
            <div className="product-info-column">
              <div className="product-meta">
                <div className={SK} style={{ width: 150, height: 12 }} />
                <div
                  className={SK}
                  style={{ width: "88%", height: 34, marginTop: 14 }}
                />
              </div>
              <div
                className={SK}
                style={{ width: 180, height: 32, marginTop: 22 }}
              />
              <div
                className={SK}
                style={{ width: "100%", height: 46, marginTop: 30 }}
              />
              <div
                className={SK}
                style={{ width: "70%", height: 46, marginTop: 12 }}
              />
              <div
                className={SK}
                style={{ width: "58%", height: 14, marginTop: 22 }}
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

/** Route-loading skeleton for /mods (configurator is client-rendered, so this
 *  is mostly the hero + a large block where the configurator mounts). */
export function ModsLoadingSkeleton() {
  return (
    <main className="config-page">
      <header className="ri-hero" aria-hidden="true">
        <div className={SK} style={{ width: 150, height: 12 }} />
        <div
          className={SK}
          style={{ width: "min(620px, 90%)", height: 44, marginTop: 18 }}
        />
        <div
          className={SK}
          style={{ width: "min(560px, 88%)", height: 14, marginTop: 18 }}
        />
      </header>
      <section aria-hidden="true">
        <div className="wrap">
          <div className={SK} style={{ width: "100%", height: 380 }} />
        </div>
      </section>
    </main>
  );
}

/** Route-loading skeleton for /work (portfolio grid). */
export function WorkLoadingSkeleton() {
  return (
    <main className="work-page">
      <section className="work-hero" aria-hidden="true">
        <div className="work-wrap">
          <div className={SK} style={{ width: 110, height: 12 }} />
          <div
            className={SK}
            style={{ width: "min(460px, 80%)", height: 48, marginTop: 18 }}
          />
          <div
            className={SK}
            style={{ width: "min(560px, 90%)", height: 14, marginTop: 18 }}
          />
        </div>
      </section>
      <section className="work-portfolio" aria-hidden="true">
        <div className="work-wrap">
          <div
            className={SK}
            style={{ width: 220, height: 20, marginBottom: 24 }}
          />
          <div className="work-grid">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className={SK} style={{ height: 320, width: "100%" }} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
