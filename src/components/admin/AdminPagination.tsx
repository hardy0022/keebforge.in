import Link from "next/link";
import { redirect } from "next/navigation";
import { pageWindow } from "@/lib/admin/pagination";

/**
 * Admin pagination bar — server component, no client JS.
 *
 * Preserves EVERY current query parameter by copying the incoming
 * searchParams and replacing only `page`, so search / filters / sort / date
 * range can never be silently dropped when paging (the previous hand-written
 * per-page `link()` helpers each had to be kept in sync by hand and could
 * drift). `page=1` is omitted so the default URL stays clean.
 */
export function AdminPagination({
  page,
  pages,
  total,
  searchParams,
  basePath,
  unit = "records",
}: {
  page: number;
  pages: number;
  total: number;
  searchParams: Record<string, string | string[] | undefined>;
  basePath: string;
  unit?: string;
}) {
  const href = (target: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (v === undefined || v === "") continue;
      if (k === "page") continue;
      p.set(k, Array.isArray(v) ? v[0] : v);
    }
    if (target > 1) p.set("page", String(target));
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  // A stale/bookmarked ?page= beyond the end (data shrank, hand-typed URL)
  // would otherwise render an empty table labelled with the last page number,
  // because the page query already ran at the out-of-range offset. Send the
  // browser to the real last page instead so the URL and the rows agree.
  if (page > pages) redirect(href(pages));

  if (pages <= 1) return null;

  const disabled: React.CSSProperties = {
    opacity: 0.4,
    cursor: "default",
  };

  const btn = "btn-admin sm";

  return (
    <nav
      aria-label="Pagination"
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
      }}
    >
      {page <= 1 ? (
        <span className={btn} style={disabled} aria-disabled="true">
          ← Previous
        </span>
      ) : (
        <Link className={btn} href={href(page - 1)} rel="prev">
          ← Previous
        </Link>
      )}

      <span className="muted num" style={{ fontSize: "0.8rem", padding: "0 4px" }}>
        Page {page} of {pages}
      </span>

      {pageWindow(page, pages).map((n, i) =>
        n === "gap" ? (
          <span
            key={`gap-${i}`}
            className="muted num"
            style={{ padding: "0 2px" }}
            aria-hidden="true"
          >
            …
          </span>
        ) : n === page ? (
          <span
            key={n}
            className={`${btn} primary`}
            aria-current="page"
            style={{ pointerEvents: "none" }}
          >
            {n}
          </span>
        ) : (
          <Link key={n} className={btn} href={href(n)}>
            {n}
          </Link>
        ),
      )}

      {page >= pages ? (
        <span className={btn} style={disabled} aria-disabled="true">
          Next →
        </span>
      ) : (
        <Link className={btn} href={href(page + 1)} rel="next">
          Next →
        </Link>
      )}

      <span className="muted num" style={{ fontSize: "0.75rem" }}>
        {total} {unit}
      </span>
    </nav>
  );
}
