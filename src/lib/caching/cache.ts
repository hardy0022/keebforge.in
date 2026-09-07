import "server-only";
import { cache } from "react";
import { unstable_cache, updateTag } from "next/cache";

/**
 * Central caching config + data-cache wrapper for DB-backed public reads.
 *
 * Every cacheable read helper (src/lib/catalog/data.ts, reviews.ts, home.ts) exits
 * through `defineCached`, so all pages share one set of tags/durations and
 * every admin mutation invaldes through the helpers at the bottom of this
 * file. Nothing user-specific (cart, checkout, orders, invoices, addresses,
 * sessions, coupons, shipping/payment/tracking state) is ever cached here.
 */

/** Revalidation tags — one per mutable slice of the public API, so a small
 *  admin change never flushes unrelated cached data. */
export const TAG = {
  products: "products",
  categories: "categories",
  brands: "brands",
  services: "services",
  work: "work",
  reviews: "reviews",
  siteSettings: "site-settings",
} as const;

/**
 * Revalidation windows (seconds). Tuned per data class; explicit tag
 * invalidation after admin mutations is the enforcement path, TTLs are the
 * floor for changes made outside the app (e.g. direct DB edits).
 *
 * - stable:    mods/services catalog + portfolio — admin-edited only.
 * - catalog:   products, listings, related, categories, home showcase.
 *              Stock counts live in this payload too and may lag at most this
 *              window: every purchase path re-validates the LIVE db
 *              (src/app/actions/cart.ts:62) and admin stock/inventory edits
 *              invalidate the tag immediately, so a stale count can never
 *              cause an incorrect sale — it only delays a display update.
 * - reviews:   approved reviews + summaries — change only via moderation or a
 *              customer editing their own review, both of which invalidate
 *              the tag immediately.
 * - settings:  siteSetting reads (acceptingOrders, maintenance flags,
 *              pickup) — short so external changes surface fast; admin saves
 *              invalidate immediately.
 */
export const TTL = {
  stable: 3600,
  catalog: 300,
  reviews: 300,
  settings: 60,
} as const;

/**
 * The Next.js data cache serializes its entries, which turns `Date` fields
 * into ISO strings. Components call real Date methods on these rows, so
 * revive the known date columns on every read (no-op when the value is
 * already a Date). Keyed by name — never by value — so content strings can't
 * be mistaken for timestamps.
 */
const DATE_KEYS = new Set([
  "createdAt",
  "updatedAt",
  "date",
  "expiresAt",
  "startDate",
  "endDate",
]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function reviveDates(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const item of value) reviveDates(item);
  } else if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (DATE_KEYS.has(key) && typeof v === "string" && ISO_DATE_RE.test(v)) {
        (value as Record<string, unknown>)[key] = new Date(v);
      } else {
        reviveDates(v);
      }
    }
  }
  return value;
}

/**
 * Wrap a DB-backed query so it (a) dedupes within a single render pass via
 * React.cache and (b) is served from the Next.js data cache across requests
 * until its tags invalidate or the TTL expires.
 */
export function defineCached<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  opts: { tags: string[]; revalidate: number; keys?: string[] },
): (...args: A) => Promise<R> {
  const read = cache(fn);
  const readCached = unstable_cache(read, opts.keys, {
    tags: opts.tags,
    revalidate: opts.revalidate,
  });
  // unstable_cache returns its stored copy on a hit without re-running the
  // callback, so the revive-aware wrapper must sit OUTSIDE it to run on both
  // hit and miss paths. updateTag/revalidateTag purge the soft tags below.
  return cache(async (...args: A) =>
    reviveDates(await readCached(...args)),
  ) as (...args: A) => Promise<R>;
}

// ─── Targeted invalidation, called by server actions after mutations ────────

/**
 * Immediate tag purging. updateTag is the read-your-own-writes primitive and
 * can only run inside a Server Action — every call site here is one. (Plain
 * revalidateTag(tag) is deprecated in Next 16; revalidatePath continues to
 * handle the route cache, see src/app/admin/actions/*.)
 */

/** A product row changed (edit, images, inventory, status, variant, import).
 *  unstable_cache tags are static per wrapper, so a single product edit
 *  revalidates the whole products slice (listings + detail + related + home)
 *  rather than one per-slug entry. */
export function invalidateProducts() {
  updateTag(TAG.products);
}

/** A category changed — also invalidates product payloads that embed it. */
export function invalidateCategories() {
  updateTag(TAG.categories);
  updateTag(TAG.products);
}

/** A brand changed (admin only; brand pickers re-render from this slice). */
export function invalidateBrands() {
  updateTag(TAG.brands);
}

/** Mods/services pricing or availability changed. */
export function invalidateServices() {
  updateTag(TAG.services);
}

/** Portfolio project created/edited/published/deleted/reordered. */
export function invalidateWork() {
  updateTag(TAG.work);
}

/** Review moderation or a customer editing/deleting their review changed
 *  public reviews AND the underlying product rating fields. */
export function invalidateReviews() {
  updateTag(TAG.reviews);
  updateTag(TAG.products);
}

/** A siteSetting (acceptingOrders, maintenance flag, pickup) changed. */
export function invalidateSiteSettings() {
  updateTag(TAG.siteSettings);
}
