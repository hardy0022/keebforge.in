# Report 01 — Public-site caching layer (2026-09-06)

## Goal

Cut repeated Prisma reads on public pages without changing render output, response bytes, or any business logic. Every public listing/detail page (home, shop, product, mods, work, reviews) was previously a fully dynamic server render doing its own DB queries per hit.

## Design

A small wrapper around Next `unstable_cache` in `src/lib/caching/cache.ts`:

- `defineCached(wrapper)` → takes an ordinary async fetcher and returns a cached version.
  The wrapper's contract: `const cache = unstable_cache(wrapperFn, keys, opts); return cache(...args)`.
- `reviveDates(obj)` — DB rows arrive from cache as plain JSON; all `Date` fields must be revived so serializers (`toISOString`, `JSON.stringify`) and `Date`-dependent logic behave identically to a cold render. Revives an explicit allowlist of Date fields.
- `TAG` / `TTL` — revalidation tags (product, categories, brands, reviews, work, home, site, orders) and expiry classes (stable = content that changes rarely, normal, flash = high-churn like the cart badge/offers).
- `invalidate<TAG>()` family — `revalidateTag` wrappers called from admin write actions so edits flush the public reads immediately.

### The two fixes that mattered

1. **`reviveDates` must wrap the cache OUTPUT, not the callback.** First version placed it inside the wrapper callback → it ran only on a cache MISS. On a hit, `unstable_cache` returns its stored copy directly and the callback (and the revive inside it) never executes → prerender serialization produced `"2026-01-01T00:00:00.000Z"` strings instead of `Date` objects. Final shape:
   `return cache(async (...args) => reviveDates(await readCached(...args)))`.
2. **Cache-key collision on zero-arg calls.** `unstable_cache` keys come from the serialized args; two zero-arg fetchers with the same empty `keys` array shared one cache slot. `getModsCatalog`, `getHomeData`, `getWorkProjects`, `getSiteReviewSummary` collided → whichever ran first served its payload to the others → `/mods` broke with `.filter is not a function`. Fix: a distinct `keys` discriminator on every `defineCached` call (`"mods-catalog"`, `"home"`, `"work-projects"`, `"site-review-summary"`, `"product-by-slug"`, etc).

## Verification

- Build green after `rm -rf .next/cache` + rebuild.
- Runtime proof with `PRISMA_QUERY_LOG=1` (query log is also proof that bracket field access on cache-revived rows works at runtime):
  - `/shop` cold = 18 queries, warm delta = **0**.
  - `/product/<slug>` cold = +44, warm delta = **0** (includes related products, reviews, weights).
  - Home and work pages 200; warm HTML **byte-identical** to cold HTML.
  - `/work/time-of-tinkering` → 404 = invented bogus slug, not a regression; `/write-review` → 307 = expected login redirect.
- Final sweep (fresh port): every public route 200; the only warm re-read is the footer `acceptingOrders` badge (60s TTL) + a `COMMIT` — verified expected, not a leak.

## Non-goals / leftovers

- Admin mutation paths were NOT all converted (kept live reads where correctness of the just-written row matters more than IO).
- The cache is in-process — a multi-instance deployment needs shared tags; fine as-is for a single Next instance.