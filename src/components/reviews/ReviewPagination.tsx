import Link from "next/link";

function pageNumbers(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const core = new Set([1, 2, current - 1, current, current + 1, total - 1, total]);
  const nums = [...core].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let prev = 0;
  for (const n of nums) {
    if (prev && n - prev > 1) out.push(null);
    out.push(n);
    prev = n;
  }
  return out;
}

/** Numeric review pagination (?rp=), shared by product pages and the /work feed. */
export function ReviewPagination({ basePath, current, pages }: { basePath: string; current: number; pages: number }) {
  const nums = pageNumbers(current, pages);
  return (
    <nav className="reviews-pagination" aria-label="Review pages">
      {current > 1 ? (
        <Link className="reviews-page reviews-page-arrow" href={`${basePath}?rp=${current - 1}`} aria-label="Previous page">
          ←
        </Link>
      ) : (
        <span className="reviews-page reviews-page-arrow is-disabled" aria-hidden="true">
          ←
        </span>
      )}
      {nums.map((n, i) =>
        n === null ? (
          <span key={`e${i}`} className="reviews-page-ellipsis" aria-hidden="true">
            …
          </span>
        ) : n === current ? (
          <span key={n} className="reviews-page is-active" aria-current="page">
            {n}
          </span>
        ) : (
          <Link key={n} className="reviews-page" href={`${basePath}?rp=${n}`}>
            {n}
          </Link>
        )
      )}
      {current < pages ? (
        <Link className="reviews-page reviews-page-arrow" href={`${basePath}?rp=${current + 1}`} aria-label="Next page">
          →
        </Link>
      ) : (
        <span className="reviews-page reviews-page-arrow is-disabled" aria-hidden="true">
          →
        </span>
      )}
    </nav>
  );
}