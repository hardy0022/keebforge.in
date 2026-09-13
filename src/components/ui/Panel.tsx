"use client";

/**
 * Step/section card header: `panel-tag` + optional `panel-title` + children.
 * Shared by /workshop (`panel ri-step`, `panel ri-review`, `panel ri-summary`)
 * and /mods (configurator panels + order preview). `className` carries the
 * host's panel shape.
 */

export function Panel({
  tag,
  title,
  children,
  className = "panel",
}: {
  tag: string;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <p className="panel-tag">{tag}</p>
      {title && <h2 className="panel-title">{title}</h2>}
      {children}
    </section>
  );
}