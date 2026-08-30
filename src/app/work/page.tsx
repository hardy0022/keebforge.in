import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/home/Reveal";
import { DiaTextReveal } from "@/components/ui/dia-text-reveal";
import { ReviewSection } from "@/components/reviews/ReviewSection";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata } from "@/lib/seo";
import { cldUrl } from "@/lib/cloudinary-url";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = buildMetadata({
  title: "Sample Work & Portfolio | KeebForge",
  description:
    "A collection of KeebForge's keyboard builds, repairs, PCB work and modifications — real projects and customer feedback from the KeebForge workshop.",
  path: "/work",
});

type WorkImage = { url: string; alt?: string; publicId?: string };

export const CATEGORY: Record<string, string> = {
  CUSTOM_BUILD: "Custom Build",
  REPAIR: "Repair",
  MOD: "Mod",
  PCB: "PCB Work",
  MOUSE: "Mouse",
  OTHER: "Project",
};

export default async function WorkPage({ searchParams }: { searchParams: Promise<{ rp?: string }> }) {
  const [{ rp }] = [await searchParams];
  const page = Math.max(1, parseInt(rp ?? "1", 10) || 1);

  const projects = await prisma.workProject.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { featured: "desc" }, { createdAt: "desc" }],
  });

  const PER_PAGE = 12;
  const featured = projects[0];
  const rest = projects.slice(1);
  const gridPages = Math.max(1, Math.ceil(rest.length / PER_PAGE));
  const gridPage = Math.min(page, gridPages);
  const gridProjects = rest.slice((gridPage - 1) * PER_PAGE, gridPage * PER_PAGE);
  const featuredImg = (featured?.images as WorkImage[] | null) ?? undefined;

  return (
    <main className="work-page">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="work-hero">
        <div className="work-wrap">
          <Reveal>
            <p className="hp-kicker work-eyebrow">
              <span className="hp-kicker-mark">{"//"}</span> Portfolio
            </p>
            <h1 className="work-hero-title">
              <DiaTextReveal
                text="Sample Work"
                textColor="var(--t1)"
                colors={["#c9f31d", "#eaff6a", "#8ec900"]}
                duration={1.4}
              />
            </h1>
            <p className="work-hero-desc">
              A collection of keyboard builds, repairs, modifications and workshop projects completed by KeebForge.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Featured work ─────────────────────────────────────────────────── */}
      <section className="work-feat" aria-labelledby="work-featured">
        <div className="work-wrap">
          {featured ? (
            <Reveal className="work-showcase-wrap">
              <article className="work-showcase">
                <div className="work-showcase-media">
                  {featuredImg?.[0] ? (
                    <>
                      <Image
                        src={cldUrl(featuredImg[0].url, 1600)}
                        alt={featuredImg[0].alt ?? featured.title}
                        fill
                        priority
                        sizes="(min-width: 720px) 325px, 100vw"
                      />
                      <span className="work-showcase-flag">Featured</span>
                    </>
                  ) : (
                    <div className="work-media-empty">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect width="20" height="14" x="2" y="5" rx="2" />
                        <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M7 17h10" />
                      </svg>
                      <span>No image yet</span>
                    </div>
                  )}
                </div>
                <div className="work-showcase-body">
                  <div className="work-showcase-title-row">
                    <h3 id="work-featured" className="work-feat-title">
                      {featured.title}
                    </h3>
                    <Link href={`/work/${featured.slug}`} className="work-showcase-link">
                      View →
                    </Link>
                  </div>
                  {featured.description && <p className="work-feat-desc">{featured.description}</p>}
                </div>
              </article>
            </Reveal>
          ) : (
            <Reveal>
              <div className="work-empty">
                <p className="work-empty-title">No projects published yet.</p>
                <p className="work-empty-sub">Once an admin publishes a project, it will appear here automatically.</p>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* ── Recent work ──────────────────────────────────────────────────── */}
      {rest.length > 0 && (
        <section className="work-portfolio" aria-labelledby="work-grid-heading">
          <div className="work-wrap">
            <Reveal>
              <div className="work-sec-head">
                <p className="hp-kicker">
                  <span className="hp-kicker-mark">{"//"}</span> Recent Work
                </p>
                <h2 id="work-grid-heading" className="work-sec-title">
                  Recent projects and workshop builds.
                </h2>
              </div>
            </Reveal>

            <div className="work-grid">
              {gridProjects.map((p, i) => {
                const imgs = (p.images as WorkImage[]) ?? [];
                const img = imgs[0];
                return (
                  <Reveal as="div" key={p.id} delay={(i % 4) * 80}>
                    <Link href={`/work/${p.slug}`} className="work-card" aria-label={p.title}>
                      <div className="work-card-media">
                        {img ? (
                          <Image src={cldUrl(img.url, 900)} alt={img.alt ?? p.title} fill sizes="(min-width: 960px) 23vw, (min-width: 640px) 46vw, 100vw" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[var(--t3)]">⌨️</div>
                        )}
                        <span className="work-card-arrow" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M7 17L17 7" />
                            <path d="M8 7h9v9" />
                          </svg>
                        </span>
                      </div>
                      <div className="work-card-body">
                        <span className="work-cat">{CATEGORY[p.category] ?? "Project"}</span>
                        <span className="work-card-title">{p.title}</span>
                        {imgs.length > 1 && <span className="work-card-photos">{imgs.length} photos</span>}
                      </div>
                    </Link>
                  </Reveal>
                );
              })}
            </div>

            {gridPages > 1 && (
              <nav className="work-pager" aria-label="Work pagination">
                {gridPage > 1 && (
                  <Link href={`/work?rp=${gridPage - 1}`} className="btn-ghost">
                    ← Newer
                  </Link>
                )}
                <span className="work-pager-info">
                  Page {gridPage} of {gridPages}
                </span>
                {gridPage < gridPages && (
                  <Link href={`/work?rp=${gridPage + 1}`} className="btn-ghost">
                    Older →
                  </Link>
                )}
              </nav>
            )}
          </div>
        </section>
      )}

      {/* ── Customer reviews ─────────────────────────────────────────────── */}
      <ReviewSection scope={{ type: "site" }} page={page} titleReveal />

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <CtaSection
        title={
          <>
            Ready to Build
            <br />
            Something Better?
          </>
        }
        desc="Have a keyboard that needs work or want something custom? Real builds and repairs, handled the same way in the KeebForge workshop."
        primaryLabel="Start a Project →"
        primaryHref="/shop"
      />
    </main>
  );
}