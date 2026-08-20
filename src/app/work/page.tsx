import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageHero } from "@/components/ui/PageHero";
import { CtaSection } from "@/components/ui/CtaSection";
import { buildMetadata } from "@/lib/seo";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = buildMetadata({
  title: "Sample Work & Portfolio | KeebForge",
  description:
    "A snapshot of KeebForge's recent keyboard builds, repairs, PCB work and modifications — real projects serviced for customers across India.",
  path: "/work",
});

export default async function WorkPage() {
  const projects = await prisma.workProject.findMany({
    where: { active: true },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
  });

  return (
    <main>
      <PageHero
        tag="Portfolio"
        title="Sample Work"
        desc="A snapshot of recent builds, repairs, and modifications. Every project below was handled end-to-end in the KeebForge workshop."
      />

      <section className="svc-section">
        <div className="wrap">
          {projects.length === 0 ? (
            <p className="text-[var(--t3)]">No projects published yet.</p>
          ) : (
            <div className="gallery-grid">
              {projects.map((p) => {
                const imgs = (p.images as { url: string; alt?: string }[]) ?? [];
                const first = imgs[0];
                return (
                  <Link key={p.id} href={`/work/${p.slug}`} className="gallery-item" aria-label={p.title}>
                    {first ? (
                      <Image src={first.url} alt={first.alt ?? p.title} fill sizes="(min-width: 768px) 33vw, 100vw" />
                    ) : (
                      <span className="flex items-center justify-center h-full text-[var(--t3)]">⌨️</span>
                    )}
                    <div className="gallery-item-overlay">
                      <span className="gallery-item-label">{p.title}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
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