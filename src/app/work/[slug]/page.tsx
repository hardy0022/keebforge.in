import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata } from "@/lib/seo";
import { getWorkProjectBySlug } from "@/lib/data";

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

  const imgs = (project.images as { url: string; alt?: string }[]) ?? [];

  return (
    <main>
      <section className="pt-[calc(var(--nav-h)+40px)] pb-8">
        <div className="wrap">
          <Breadcrumbs items={[{ name: "Work", href: "/work" }, { name: project.title }]} />
        </div>
      </section>

      <section className="pb-8">
        <div className="wrap">
          <div className="max-w-[760px]">
            <h1 className="font-display text-[clamp(1.8rem,4vw,2.6rem)] font-bold leading-tight tracking-[-0.02em] text-[var(--t1)]">
              {project.title}
            </h1>
            {project.date && (
              <p className="mt-2 text-[0.68rem] uppercase tracking-[0.1em] text-[var(--t3)]">
                {project.date.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
              </p>
            )}
            <p className="mt-4 text-[0.9rem] leading-relaxed text-[var(--t2)]">{project.description}</p>
            {project.workPerformed && (
              <p className="mt-3 text-[0.85rem] leading-relaxed text-[var(--t2)]">{project.workPerformed}</p>
            )}
          </div>
        </div>
      </section>

      {imgs.length > 0 && (
        <section className="pb-8">
          <div className="wrap">
            <div className="grid gap-4 md:grid-cols-2">
              {imgs.map((img, i) => (
                <figure
                  key={i}
                  className="rounded-[var(--r-md)] overflow-hidden border border-[var(--bdr)] bg-[var(--bg1)]"
                >
                  <Image
                    src={img.url}
                    alt={img.alt ?? project.title}
                    width={1200}
                    height={900}
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="w-full h-auto"
                  />
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="svc-section">
        <div className="wrap">
          <div className="flex flex-wrap gap-3">
            <Link href="/checkout" className="btn-prime">
              Start a Project Like This
            </Link>
            <Link href="/work" className="btn-ghost">
              ← All Work
            </Link>
          </div>
        </div>
      </div>

      <CtaSection
        title={
          <>
            See Your Build
            <br />
            Here Next
          </>
        }
      />
    </main>
  );
}