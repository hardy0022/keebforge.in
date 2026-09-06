# 02 — Architecture

## Stack (current, 2026-08-19)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.3.1 (App Router, Turbopack) | React 19.2, React Compiler enabled |
| Language | TypeScript (strict) | |
| Styling | Tailwind CSS v4 | `globals.css`, theme tokens in `src/app/globals.css` |
| ORM | Prisma 6.19 | singleton client in `src/lib/prisma.ts` |
| Database | Supabase PostgreSQL (hosted) | Supabase is **PostgreSQL only** now — auth was migrated away |
| Auth | Better Auth 1.7.1 + Prisma adapter | sole auth authority; `@better-auth/infra` dash plugin |
| Media | Cloudinary 2.10.1 | installed; integration pending credentials |
| Email | Resend | contact form + future transactional mail |
| Payments | Razorpay | installed; integration is Phase 6 |
| Validation | zod 4 | server actions + forms |
| Image optimization | sharp + next/image | `scripts/optimize-assets.mjs` |

## The old auth (read-only historical note)

Originally Supabase Auth powered sessions (via `src/lib/supabase/*`). This was **fully replaced by Better Auth** on 2026-08-19. Supabase remains ONLY as the PostgreSQL host. See `04-auth.md`.

## Runtime diagram

```
Browser ──► Next.js (App Router, server components)
              │
              ├─ src/lib/data.ts ──► Prisma ──► Supabase PostgreSQL
              │        (React cache() — server-only)
              │
              ├─ src/lib/auth.ts ──► Better Auth (/api/auth/*) ──► user/session tables
              │        (getCurrentAuth / requireUser / requireAdmin)
              │
              ├─ src/app/actions/*  (server actions: cart, inquiry)
              │        └─ zod validation → Prisma
              │
              ├─ src/proxy.ts (middleware)
              │        └─ case-variant redirects only (no session handling)
              │
              └─ /api/auth/[...all] (Better Auth handler)
```

## Where things live

```
src/app/                    routes (see 05-routes-seo.md)
  (public)/                 route group: about/contact/faq/terms/privacy/returns/shipping (URLs unchanged)
src/app/actions/            server actions (cart.ts, inquiry.ts, repair-request.ts)
src/app/api/auth/[...all]/  Better Auth HTTP handler
src/components/             ui/, icons/, layout/, home/, services/, shop/, contact/, cart/, admin/
src/lib/                    prisma.ts, data.ts, auth.ts, auth/better-auth.ts,
                            cart.ts, money.ts, orders.ts, faq.ts, seo.tsx,
                            caching/cache.ts, slugify.ts, ist.ts, delhivery/
src/proxy.ts                middleware
prisma/schema.prisma        single source of truth for the DB
prisma/migrations/          applied migrations (see 03-database.md)
prisma/seed.ts              idempotent seed (products intentionally left empty)
scripts/optimize-assets.mjs asset optimization
public/                     static assets incl. legacy work images (Cloudinary migration pending)
```

## Key architectural rules

1. **Server-first.** Only 5 client components exist: `SiteHeader`, `InquiryForm`, `AddToCart`, `CartQty`, `ServiceConfigurator`. Everything else is a server component.
2. **All data fetchers use `React.cache()`** (`src/lib/data.ts`) to dedupe within a request.
3. **Parallel queries** with `Promise.all`; never sequential awaits for independent reads.
4. **Server-only imports.** Prisma and env secrets never reach the client bundle (verified — no Prisma in client bundles).
5. **Money = integer paise** end-to-end; display only via `formatINR()` (₹ + 2dp) or `formatPaiseWhole()` (whole rupee, no ₹) in `src/lib/money.ts`.
6. **Authorization is server-side.** `requireAdmin()`/`requireUser()` in `src/lib/auth.ts` redirect; never trust client flags.
7. **`next/image`** for all user/remote images (Cloudinary `remotePatterns` needed in `next.config.ts` when Cloudinary lands).

## Caching layer (added 2026-09-06)

- `src/lib/caching/cache.ts` hosts the shared read-cache primitives: `TAG` (revalidation tags: product/categories/brands/reviews/work/home/site/orders), `TTL` (stable/normal/flash tables), `defineCached(wrapper)`, `reviveDates` (Date recovery for DB rows), and the `invalidate*` family wired into admin write actions. The implementation wraps `unstable_cache`: `const cache = unstable_cache(wrapperFn, keys, opts); return cache(...args)` — and **`reviveDates` must wrap the cache's OUTPUT** (runs on hit + miss; `unstable_cache` returns the stored copy on a hit without re-running the callback).
- Public fetchers (`src/lib/data.ts`, `src/lib/home.ts`, `src/lib/reviews.ts`, `src/lib/work.ts`) plus cached admin reads (`src/lib/admin-catalog.ts` categories/brands/work, `src/lib/admin.ts` reviews) all route through it. Every `defineCached` call needs a distinct `keys` array — zero-arg calls with no keys collide (variant of `getModsCatalog` vs `getHomeData` shared one unstable_cache slot → `.filter is not a function`).
- Verified: /shop 18 queries cold → 0 warm; /product +44 cold → 0 warm; warm HTML byte-identical to cold. Admin write actions call `invalidate*` so stale reads get flushed.

## Runtime notes

- Next.js `redirect()` matches sources **case-insensitively**; case-variant old URLs (`/About`, `/Review`) are handled in `src/proxy.ts` instead of `next.config.ts` to avoid shadowing real routes.
- Server actions are invoked via the Next action-protocol POST; tests must replay the `$ACTION_*` fields (see `10-gotchas.md`).
- Do NOT re-add `loading.tsx` to `/product/[slug]` or `/shop` (soft-404, G-003, resolved 2026-09-06).