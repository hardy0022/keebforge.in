import Link from "next/link";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { ReviewSummary } from "@/components/reviews/ReviewSummary";
import { Reveal } from "@/components/home/Reveal";
import type { HomeData } from "@/lib/home";

export function CustomerReviews({ reviews }: { reviews: HomeData["reviews"] }) {
  const { summary, items } = reviews;

  return (
    <section className="hp-reviews" aria-labelledby="reviews-heading">
      <header className="hp-section-head">
        <Reveal as="div">
          <p className="hp-kicker">
            <span className="hp-kicker-mark">{"//"}</span> Customer Reviews
          </p>
        </Reveal>
        <Reveal delay={80} as="h2" id="reviews-heading" className="hp-section-title">
          What customers say.
        </Reveal>
      </header>

      {summary.count === 0 ? (
        <Reveal className="review-empty">
          <p className="review-empty-title">No reviews yet</p>
          <Link href="/write-review" className="btn-prime">
            Write a Review →
          </Link>
        </Reveal>
      ) : (
        <>
          <Reveal delay={60}>
            <ReviewSummary count={summary.count} average={summary.average} distribution={summary.distribution} />
          </Reveal>

          <div className="reviews-grid hp-reviews-grid">
            {items.map((r, i) => (
              <Reveal key={r.id} delay={(i % 4) * 70}>
                <ReviewCard review={r} verified={r.verified} />
              </Reveal>
            ))}
          </div>
        </>
      )}
    </section>
  );
}