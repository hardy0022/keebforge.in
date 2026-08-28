import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageHero } from "@/components/ui/PageHero";
import { CtaSection } from "@/components/ui/CtaSection";
import { ReviewCard } from "@/components/reviews/ReviewCard";
import { ReviewPagination } from "@/components/reviews/ReviewPagination";
import { ReviewSummary } from "@/components/reviews/ReviewSummary";
import { buildMetadata } from "@/lib/seo";
import { prisma } from "@/lib/prisma";
import { getPublicReviews, getSiteReviewSummary } from "@/lib/reviews";

export const metadata: Metadata = buildMetadata({
  title: "Sample Work & Portfolio | KeebForge",
  description:
    "A snapshot of KeebForge's recent keyboard builds, repairs, PCB work and modifications — real projects serviced for customers across India.",
  path: "/work",
});

type WorkImage = { url: string; alt?: string; publicId?: string };

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ rp?: string }> }) {
  const [{ rp }] = [await searchParams];
  const page = Math.max(1, parseInt(rp ?? "1", 10) || 1);

  const [projects, summary, feed] = await Promise.all([
    prisma.workProject.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { featured: "desc" }, { createdAt: "desc" }],
    }),
    getSiteReviewSummary(),
    getPublicReviews({ page }),
  ]);
  const currentFeedPage = Math.min(page, feed.pages);

  return (
    <main>
      <PageHero
        tag="Portfolio"
        title="Sample Work"
        desc="A snapshot of recent builds, repairs, and modifications. Every project below was handled end-to-end in the KeebForge workshop."
      />

      <section className="svc-section" aria-labelledby="work-heading">
        <div className="wrap">
          <div className="section-head">
            <h2 id="work-heading" className="product-section-title">
              From the Workshop
            </h2>
            <p className="text-[var(--t3)]">Hand-picked projects — builds, repairs, and mods done in-house.</p>
          </div>

          {projects.length === 0 ? (
            <p className="text-[var(--t3)]">No projects published yet.</p>
          ) : (
            <div className="gallery-grid">
              {projects.map((p) => {
                const imgs = (p.images as WorkImage[]) ?? [];
                const first = imgs[0];
                return (
                  <Link key={p.id} href={`/work/${p.slug}`} className="gallery-item" aria-label={p.title}>
                    {first ? (
                      <Image src={first.url} alt={first.alt ?? p.title} fill sizes="(min-width: 1080px) 33vw, (min-width: 640px) 50vw, 100vw" />
                    ) : (
                      <span className="flex items-center justify-center h-full text-[var(--t3)]">⌨️</span>
                    )}
                    <div className="gallery-item-overlay">
                      <span className="gallery-item-label">{p.title}</span>
                      {imgs.length > 1 && <span className="gallery-item-meta">{imgs.length} photos</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="svc-section reviews-section" aria-labelledby="work-reviews-heading">
        <div className="wrap">
          <div className="product-reviews">
            <header className="product-reviews-head">
              <h2 id="work-reviews-heading" className="product-section-title">
                Customer Reviews
              </h2>
              <Link href="/write-review" className="btn-prime review-write-btn">
                Write a Review →
              </Link>
            </header>

            {summary.count === 0 ? (
              <div className="review-empty">
                <p className="review-empty-title">No reviews yet</p>
                <p className="review-empty-sub">Share your experience with KeebForge and help others choose with confidence.</p>
                <Link href="/write-review" className="btn-prime">
                  Write a Review →
                </Link>
              </div>
            ) : (
              <>
                <ReviewSummary count={summary.count} average={summary.average} distribution={summary.distribution} />

                <div className="reviews-grid-wrap">
                  <p className="reviews-grid-label">Reviews</p>
                  <div className="reviews-grid">
                    {feed.items.map((r) => (
                      <ReviewCard key={r.id} review={r} verified={r.verified} />
                    ))}
                  </div>

                  {feed.pages > 1 && <ReviewPagination basePath="/work" current={currentFeedPage} pages={feed.pages} />}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <CtaSection
        title={
          <>
            Want Work
            <br />
            Like This?
          </>
        }
        desc="Every project starts with an order — describe your build or repair and get it handled the same way."
      />
    </main>
  );
}