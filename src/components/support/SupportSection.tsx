import type { ReactNode } from "react";

/** Shared editorial block for support/help pages — divider-separated, no cards. */
export function SupportSection({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section className="support-section" aria-labelledby={id ?? title}>
      <h2 className="support-h" id={id}>
        {title}
      </h2>
      <div className="support-body">{children}</div>
    </section>
  );
}

/** Clearly-marked policy placeholder — flagged in the UI so it's easy to swap later. */
export function PolicyPlaceholder({ children }: { children: ReactNode }) {
  return <p className="support-note">{children}</p>;
}