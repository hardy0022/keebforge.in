import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/home/Reveal";
import { ReviewSection } from "@/components/reviews/ReviewSection";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata } from "@/lib/seo";
import { getWorkProjects } from "@/lib/catalog/data";

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

export default async function WorkPage({
  searchParams,
}: {
  searchParams: Promise<{ rp?: string }>;
}) {
  const [{ rp }] = [await searchParams];
  const page = Math.max(1, parseInt(rp ?? "1", 10) || 1);

  const projects = await getWorkProjects();

  const PER_PAGE = 12;
  const featured = projects[0];
  // `projects` already has the featured project first, so paginating the whole
  // list keeps ordering identical and renders the featured one as grid card #1.
  const gridPages = Math.max(1, Math.ceil(projects.length / PER_PAGE));
  const gridPage = Math.min(page, gridPages);
  const gridProjects = projects.slice(
    (gridPage - 1) * PER_PAGE,
    gridPage * PER_PAGE,
  );

  return (
    <main className="work-page">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      {/* Above-the-fold hero is plain server markup: no Reveal (IntersectionObserver
          gating), no DiaTextReveal (text hidden behind a JS-driven gradient sweep).
          Both left the LCP + hero invisible for ~2.8s until hydration on mobile. */}
      <section className="work-hero">
        <div className="work-wrap">
          <div>
            <p className="hp-kicker work-eyebrow">
              <span className="hp-kicker-mark">{"//"}</span> Portfolio
            </p>
            <h1 className="work-hero-title">Sample Work</h1>
            <p className="work-hero-desc">
              A collection of keyboard builds, repairs, modifications and
              workshop projects completed by KeebForge.
            </p>
          </div>
        </div>
      </section>

      {/* ── Project grid ────────────────────────────────────────────────── */}
      <section
        className="work-portfolio"
        aria-labelledby={projects.length > 0 ? "work-grid-heading" : undefined}
      >
        <div className="work-wrap">
          {projects.length === 0 ? (
            <Reveal>
              <div className="work-empty">
                <p className="work-empty-title">No projects published yet.</p>
                <p className="work-empty-sub">
                  Once an admin publishes a project, it will appear here
                  automatically.
                </p>
              </div>
            </Reveal>
          ) : (
            <>
              {/* Visual heading removed — the per-card category tag carries the
                  labelling now. Kept for screen readers and the document
                  outline so the section stays named. */}
              <h2 id="work-grid-heading" className="sr-only">
                Recent projects and workshop builds.
              </h2>

              <div className="work-grid">
                {gridProjects.map((p, i) => {
                  const imgs = (p.images as WorkImage[]) ?? [];
                  const img = imgs[0];
                  const isFeatured = p.id === featured?.id;
                  return (
                    <Reveal
                      as="div"
                      key={p.id}
                      delay={(i % 3) * 80}
                      className={isFeatured ? "work-card-lead" : undefined}
                    >
                      {/* No aria-label: the name is computed from the visible
                          title + "View ->", so it always matches what is on screen. */}
                      <Link href={`/work/${p.slug}`} className="work-card">
                        <div className="work-card-media">
                          {img ? (
                            <Image
                              src={img.url}
                              alt={img.alt ?? p.title}
                              fill
                              // The featured project is still card #1 and the
                              // largest above-the-fold image on the page, so it
                              // keeps the eager load it had as the hero.
                              priority={isFeatured}
                              sizes="(min-width: 1280px) 381px, (min-width: 960px) 30vw, (min-width: 640px) 47vw, 92vw"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[var(--t3)]">
                              ⌨️
                            </div>
                          )}
                          {isFeatured && (
                            <span className="work-card-flag">Featured</span>
                          )}
                        </div>
                        <div className="work-card-body">
                          <span className="work-cat">
                            {CATEGORY[p.category] ?? "Project"}
                          </span>
                          <span className="work-card-title">{p.title}</span>
                          <span className="work-card-foot">
                            <span className="work-card-photos">
                              {imgs.length > 1 ? `${imgs.length} photos` : ""}
                            </span>
                            <span className="work-card-cta">View →</span>
                          </span>
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
            </>
          )}
        </div>
      </section>

      {/* ── Customer reviews ─────────────────────────────────────────────── */}
      <ReviewSection scope={{ type: "site" }} page={page} />

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
