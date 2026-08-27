# 05 — Routes, Redirects & SEO

## Public routes (20 total in build)

| Route | Type | Source | Notes |
|---|---|---|---|
| `/` | static | `src/app/page.tsx` | homepage: hero, services, marquee, FAQ |
| `/about` | static | `src/app/about/page.tsx` | |
| `/services` | static | `src/app/services/page.tsx` | landing page: hero (~68vh, badges visual), 4 category cards, 6 DB-priced popular services, keyboard/mouse splits, repair/custom panels, steps, FAQ, final CTA; container = `--container-w`, navbar matched via `body:has(main.sv-land)` |
| `/services/configure` | static | `src/app/services/configure/page.tsx` | interactive configurator moved here from `/services` (device tabs, checkbox service matrix, live subtotal); hides quote-offline services via slug sets |
| `/repair` | static | `src/app/repair/page.tsx` | Electronics Repair + inquiry form with photo upload |
| `/reviews` | static | `src/app/reviews/page.tsx` | DB-backed, approved only |
| `/work` | static | `src/app/work/page.tsx` | portfolio; images still local/JSON — Cloudinary pending |
| `/work/[slug]` | dynamic | `src/app/work/[slug]/page.tsx` | |
| `/faq` | static | `src/app/faq/page.tsx` | DB-backed; keyboard FAQ built by `buildKeyboardFaq(priceText)` |
| `/terms` | static | `src/app/terms/page.tsx` | |
| `/contact` | static | `src/app/contact/page.tsx` | Resend-powered form (`InquiryForm`) |
| `/thanks` | static | `src/app/thanks/page.tsx` | post-contact |
| `/shop` | dynamic | `src/app/shop/page.tsx` | filters, sort, pagination; `error.tsx` |
| `/shop/[category]` | dynamic | `src/app/shop/[category]/page.tsx` | 404 on invalid category |
| `/product/[slug]` | dynamic | `src/app/product/[slug]/page.tsx` | gallery, variants, specs, related, JSON-LD; `error.tsx` |
| `/cart` | dynamic | `src/app/cart/page.tsx` | guest + logged-in cart |
| `/checkout` | dynamic | `src/app/checkout/page.tsx` | real cart summary; payment UI is Phase 6 |
| `/api/auth/*` | API | `src/app/api/auth/[...all]/route.ts` | Better Auth |
| `/not-found` | — | `src/app/not-found.tsx` | |
| `/robots.txt`, `/sitemap.xml` | — | `src/app/robots.ts`, `src/app/sitemap.ts` | sitemap includes product slugs |
| `/login` | dynamic | `src/app/login/page.tsx` | sign-in / create-account toggle (`SignInForm`) |

## Admin routes (behind `requireAdmin()`, 307 → `/login` when unauthenticated)

| Route | Notes |
|---|---|
| `/admin` | dashboard: metrics, revenue chart, repair pipeline, low stock, top products |
| `/admin/orders`, `/admin/orders/[orderNumber]` | list + detail (status/timeline/shipping/notes/archive) |
| `/admin/products` | product list (filters/sort/pagination, stock badges, sales) |
| `/admin/products/new`, `/admin/products/[id]`, `/admin/products/[id]/edit` | create / detail / 9-section form |
| `/admin/products/categories` | nested category CRUD (`?edit=<id>`) |
| `/admin/brands` | brand CRUD (`?edit=<id>`) |
| `/admin/products/inventory` | stock rows + inline adjust + movement ledger |
| `/admin/products/import`, `/admin/products/export` | CSV import page + CSV download route |
| `/admin/services` | per-service pricing editor (unit/price/min/max/label/flags → feeds the public configurator) |
| `/admin/[...slug]` | stub for unbuilt sections |
| `/api/admin/upload` | gated Cloudinary upload (501 without creds) |

Admin chrome is hidden from the public site by `ShowOnSite` in the root layout.

## Redirects (two layers)

**`next.config.ts` → `redirects()` (all 308):**
- `/keyboard-repair` → `/repair`
- `/mouse-repair` → `/repair`
- `/pricing` → `/services`
- `/order` → `/checkout`
- `/Terms&Conditions` → `/terms` (note: URL-encoded `%26` does NOT match — only literal `&`)
- 17 old service slugs → `/services` (D-022 removed the per-service detail pages they used to target)

**`src/proxy.ts` middleware (308):** handles the case-variant URLs because Next's `redirect()` matching is **case-insensitive** and would shadow real routes:
- `/About`, `/About/` → `/about`
- `/Review`, `/Review/` → `/reviews`

## SEO

- `robots.ts` disallows `/admin`, `/account`, `/checkout`, `/api/`, `/track`.
- `sitemap.ts` emits public routes + product slugs.
- Services and products carry JSON-LD structured data.
- `seoTitle` / `seoDescription` fields exist on `Service`, `Product`, `Brand`, `Category` and are used for metadata; admin pages set `robots: { index: false }`.

## Known soft-404 trap

A `loading.tsx` in `/shop` or `/product/[slug]` caused `notFound()` to return **HTTP 200** (soft-404). These were **removed** deliberately. `error.tsx` is fine (does not mask 404s). If you ever add a `loading.tsx`, re-verify that unknown slugs still 404.