/** Admin list pages are paginated at 15 records. */
export const ADMIN_PAGE_SIZE = 15;

/** Result shape every paginated admin query returns. */
export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pages: number;
};

/** Normalises a ?page= param: NaN/0/negative/garbage all become 1. */
export function parsePage(raw: string | number | undefined): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/**
 * Builds a page result.
 *
 * `page` is reported as requested (floored at 1) rather than clamped to the
 * last page: the rows were already fetched at the requested offset, so clamping
 * the label here would render an empty table captioned with the last page
 * number. <AdminPagination> redirects an out-of-range page to the real last
 * page, so the URL and the rows agree.
 */
export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  size: number = ADMIN_PAGE_SIZE,
): Paginated<T> {
  const pages = Math.max(1, Math.ceil(total / size));
  return { items, total, page: Math.max(1, Math.floor(page) || 1), pages };
}

/**
 * Window of page numbers with ellipsis gaps, e.g. [1, "…", 4, 5, 6, 7, "…", 20].
 * Never renders one button per page.
 */
export function pageWindow(
  page: number,
  pages: number,
  span = 2,
): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "gap")[] = [1];
  const start = Math.max(2, page - span);
  const end = Math.min(pages - 1, page + span);
  if (start > 2) out.push("gap");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pages - 1) out.push("gap");
  out.push(pages);
  return out;
}
