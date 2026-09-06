/**
 * URL slug from a title. `stripQuotes` (catalog) removes apostrophes/quotes
 * outright; `maxLength` + `fallback` (work projects) guards the URL length.
 */
export function slugify(
  s: string,
  opts: { stripQuotes?: boolean; maxLength?: number; fallback?: string } = {},
): string {
  let out = s.toLowerCase().trim();
  if (opts.stripQuotes) out = out.replace(/['"]/g, "");
  out = out
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (opts.maxLength) out = out.slice(0, opts.maxLength);
  return out || (opts.fallback ?? "");
}
