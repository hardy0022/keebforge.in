import Link from "next/link";

export type EmptyStateAction = { label: string; href: string; variant?: "primary" | "ghost" };
export type EmptyStateConfig = {
  eyebrow: string;
  title: string;
  desc: string;
  actions: EmptyStateAction[];
};

/* Polished fallback for listings without a bespoke empty state. */
export const DEFAULT_EMPTY_STATE: EmptyStateConfig = {
  eyebrow: "// Shop",
  title: "Nothing Here Yet",
  desc: "No products in this view right now. Browse the full catalogue or check back soon.",
  actions: [{ label: "Browse All Products →", href: "/shop", variant: "ghost" }],
};

export function ShopEmptyState({ config }: { config: EmptyStateConfig }) {
  return (
    <section className="empty-hero" aria-live="polite">
      <div className="empty-card">
        <span className="empty-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <rect x="2.5" y="6" width="19" height="12" rx="2" />
            <path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M6 13h.01M9 13h.01M12 13h.01M15 13h.01M18 13h.01M8.5 15.7h7" />
          </svg>
        </span>
        <p className="sec-num">{config.eyebrow}</p>
        <h2 className="empty-title">{config.title}</h2>
        <p className="empty-desc">{config.desc}</p>
        <div className="empty-actions">
          {config.actions.map((a) => (
            <Link key={a.href} href={a.href} className={a.variant === "ghost" ? "btn-ghost" : "btn-prime"}>
              {a.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
