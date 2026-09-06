# Report 02 — Admin-side caching (2026-09-06)

## Goal

Also apply the public `defineCached` layer to admin reads, so heavy admin screens (categories, brands, work manager, reviews) don't re-query the DB on every page load — without changing any admin write behavior or authz.

## What was wired

Reused `src/lib/caching/cache.ts` (already shipped for the public site):

- `TAG.brands` added + `invalidateBrands()` in cache.ts.
- `src/lib/admin-catalog.ts`:
  - `getAdminCategories` (tag `categories`), `getAdminBrands` (tag `brands`) → `defineCached`.
  - `getAdminWorkProjects` + `getAdminWorkProject` (tag `work`, TTL `stable`).
- `src/lib/admin.ts`:
  - `getAdminReviews` refactor → `adminReviewsPage` (plain `React.cache`, request-scoped) + `cachedAdminReviews` (`defineCached`, tag `reviews`, keys `["admin-reviews"]`).
  - `getAdminReviews(params)` bypasses the cache entirely when `params.q` is present (unbounded free-text search must always be fresh).
- `/admin/work/page.tsx` + `/admin/work/[id]/page.tsx` routed through the cached helpers.
- `saveBrand` in `src/app/admin/actions/catalog.ts` now calls `invalidateBrands()` so edits flush the cached brand reads.
- Admin pages consuming the catalog reads (`/admin/products` list, product detail with inventory movements, `/admin/products/inventory`, dashboard/analytics) are **deliberately left live** — they aggregate order/sales data where staleness is unacceptable.

## Verification

- `npx tsc --noEmit` clean, eslint 0 errors, build green (`kf-build7`).
- Runtime smoke: all public routes 200; `/admin*` routes 307 → login when unauthenticated. Cached reads on admin pages only run post-auth, so warm/cold deltas on admin screens can't be measured without admin credentials — the mechanism is identical to the public `defineCached` path already proven byte-for-byte.
- One warm-delta blip (8 reads on `/product`) was traced to a stale `.next/cache` from a **pre-rebuild binary** (cross-build cache mismatch, one-time repopulation). Re-measured from a clean cache on a fresh port: warm `/product` delta **0**.

## Lesson

Whenever changing the cached build, always clear `.next/cache` before measuring warm deltas — a leftover from an older binary makes the numbers lie (see G-003 notes; this is now part of the cache verification recipe).