import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { WorkImageSlider } from "@/components/work/WorkImageSlider";
import { buildMetadata } from "@/lib/seo";
import { getWorkProjectBySlug } from "@/lib/data";

type WorkImage = { url: string; alt?: string; publicId?: string };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await getWorkProjectBySlug(slug);
  if (!p) return buildMetadata({ title: "Project not found | KeebForge", description: "", path: "/work", noIndex: true });
  return buildMetadata({ title: `${p.title} | KeebForge`, description: p.description, path: `/work/${p.slug}` });
}

export default async function WorkDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getWorkProjectBySlug(slug);
  if (!project) notFound();

  const imgs = (project.images as WorkImage[] | null) ?? [];
  const date = project.date
    ? project.date.toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : null;

  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="pt-[calc(var(--nav-h)+44px)] pb-14 md:pb-20">
        <div className="wrap">
          <Breadcrumbs className="breadcrumbs-lime" items={[{ name: "Work", href: "/work" }, { name: project.title }]} />

          <div className="mt-10 grid items-center gap-10 md:mt-14 md:grid-cols-[45%_55%] md:gap-12">
            <div className="max-w-[540px]">
              <h1 className="font-display text-[clamp(2.25rem,5vw,4.25rem)] font-bold leading-[1.02] tracking-[-0.03em] text-[var(--t1)]">
                {project.title}
              </h1>
              {date && (
                <p className="mt-4 text-[0.7rem] uppercase tracking-[0.12em] text-[var(--t3)]">Completed {date}</p>
              )}
              <div className="mt-6 text-[0.95rem] leading-relaxed text-[var(--t2)] md-content">
                <ReactMarkdown remarkPlugins={[remarkBreaks]}>{project.description}</ReactMarkdown>
              </div>
            </div>

            {imgs.length > 0 && <WorkImageSlider images={imgs} projectName={project.title} />}
          </div>
        </div>
      </section>

      {/* ── About this project ───────────────────────────────────────────── */}
      {project.workPerformed && (
        <section className="pb-16 md:pb-20">
          <div className="wrap">
            <div className="max-w-[680px]">
              <h2 className="font-display text-[clamp(1.4rem,3vw,2rem)] font-bold tracking-[-0.02em] text-[var(--t1)]">
                About this project
              </h2>
              <div className="mt-5 text-[0.95rem] leading-relaxed text-[var(--t2)] md-content">
                <ReactMarkdown remarkPlugins={[remarkBreaks]}>{project.workPerformed}</ReactMarkdown>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <section className="py-15">
        <div className="wrap">
          <div className="mx-auto max-w-[960px] rounded-[var(--r-md)] border border-[var(--bdr)] bg-[var(--bg1)] px-6 py-12 text-center md:py-14">
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.2em] text-[var(--acc)]">
              Have a project like this?
            </p>
            <h2 className="mt-4 font-display text-[clamp(1.9rem,3vw,2.5rem)] font-bold tracking-[-0.02em] text-[var(--t1)]">
              Let&apos;s build something great.
            </h2>
            <p className="mt-4 text-[0.9rem] leading-relaxed text-[var(--t2)]">
              Have an idea in mind? Let&apos;s turn it into something real.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/shop/checkout" className="btn-prime">
                Start a Project Like This
              </Link>
              <Link href="/work" className="btn-ghost">
                ← All Work
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}