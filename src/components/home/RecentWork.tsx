import Link from "next/link";
import Image from "next/image";
import { Reveal } from "@/components/home/Reveal";
import { cldUrl } from "@/lib/cloudinary-url";
import type { HomeWork } from "@/lib/home";

const CATEGORY: Record<string, string> = {
  CUSTOM_BUILD: "Custom Build",
  REPAIR: "Repair",
  MOD: "Mod",
  PCB: "PCB Work",
  MOUSE: "Mouse",
  OTHER: "Project",
};

function WorkCard({ project, className, delay, sizes }: { project: HomeWork; className: string; delay?: number; sizes: string }) {
  const img = project.images[0];
  return (
    <Reveal as="div" className={className} delay={delay}>
      {img ? (
        <Image src={cldUrl(img.url, 1400)} alt={img.alt ?? project.title} fill sizes={sizes} />
      ) : (
        <span className="hp-work-fallback" aria-hidden="true">
          ⌨
        </span>
      )}
      <span className="hp-work-meta">
        <span className="hp-work-cat">{CATEGORY[project.category] ?? "Project"}</span>
        <span className="hp-work-title">{project.title}</span>
      </span>
      <Link href={`/work/${project.slug}`} className="hp-stretch" aria-label={project.title} />
    </Reveal>
  );
}

export function RecentWork({ work }: { work: HomeWork[] }) {
  if (work.length === 0) return null;

  const [feature, second, third, ...more] = work;

  return (
    <section className="hp-recent" aria-labelledby="recent-work">
      <header className="hp-section-head">
        <Reveal as="div">
          <p className="hp-kicker">
            <span className="hp-kicker-mark">{"//"}</span> Recent Work
          </p>
        </Reveal>
        <Reveal delay={80} as="h2" id="recent-work" className="hp-section-title">
          Real builds, repairs and modifications.
        </Reveal>
      </header>

      <div className="hp-recent-grid">
        <WorkCard project={feature} className="hp-work hp-work--feature" sizes="(min-width: 1024px) 66vw, 100vw" />
        {second && (
          <WorkCard project={second} className="hp-work hp-work--tall" delay={100} sizes="(min-width: 1024px) 34vw, 100vw" />
        )}
        {third && (
          <WorkCard project={third} className="hp-work hp-work--wide" delay={160} sizes="(min-width: 1024px) 34vw, 100vw" />
        )}
        {more.map((p, i) => (
          <WorkCard
            project={p}
            className="hp-work hp-work--square"
            delay={i * 80}
            key={p.id}
            sizes="(min-width: 1024px) 22vw, 45vw"
          />
        ))}
      </div>

      <Reveal className="hp-recent-cta" delay={120}>
        <Link href="/work" className="btn-ghost">
          View All Work <span aria-hidden="true">→</span>
        </Link>
      </Reveal>
    </section>
  );
}