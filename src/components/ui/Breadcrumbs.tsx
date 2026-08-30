import Link from "next/link";

export function Breadcrumbs({ items, className }: { items: { name: string; href?: string }[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`text-xs tracking-wider text-[var(--t3)] uppercase${className ? ` ${className}` : ""}`}>
      <ol className="flex flex-wrap gap-1.5 items-center">
        <li>
          <Link href="/" className="hover:text-[var(--t1)] transition-colors">
            Home
          </Link>
        </li>
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="opacity-50">
              /
            </span>
            {item.href ? (
              <Link href={item.href} className="hover:text-[var(--t1)] transition-colors">
                {item.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-[var(--t1)]">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}