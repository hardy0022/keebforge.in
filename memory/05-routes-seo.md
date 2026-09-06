# 05 — Routes, Redirects & SEO

## Public routes (static info pages live under `app/(public)/`; URLs unchanged since route groups don't affect paths)

| Route | Type | Source | Notes |
|---|---|---|---|
| `/` | static | `src/app/page.tsx` | homepage: hero, services, marquee, FAQ |
| `/about` | static | `src/app/(public)/about/page.tsx` | |
| `/services` → 307 | — | `next.config.ts` redirect | real page is `/mods` |
| `/mods` | static | `src/app/mods/page.tsx` | interactive configurator: device tabs, checkbox service matrix, live subtotal + Pay & Confirm |
| `/workshop` | static | `src/app/workshop/page.tsx` | Custom Work & Repairs intake (`RepairIntake`) |
| `/reviews` | static | `src/app/reviews/page.tsx` | DB-backed, approved only |
| `/work` | static | `src/app/work/page.tsx` | portfolio; images still local/JSON — Cloudinary pending |
| `/work/[slug]` | dynamic | `src/app/work/[slug]/page.tsx` | |
| `/faq` | static | `src/app/(public)/faq/page.tsx` | DB-backed |
| `/terms` | static | `src/app/(public)/terms/page.tsx` | |
| `/privacy-policy` | static | `src/app/(public)/privacy-policy/page.tsx` | |
| `/returns-refunds` | static | `src/app/(public)/returns-refunds/page.tsx` | |
| `/shipping-information` | static | `src/app/(public)/shipping-information/page.tsx` | |
| `/contact` | static | `src/app/(public)/contact/page.tsx` | Resend-powered form (`InquiryForm`) |
| `/shop` | dynamic | `src/app/shop/page.tsx` | filters, sort, pagination; `error.tsx` |
| `/shop/[category]` | dynamic | `src/app/shop/[category]/page.tsx` | 404 on invalid category |
| `/product/[slug]` | dynamic | `src/app/product/[slug]/page.tsx` | gallery, variants, specs, related, JSON-LD; `error.tsx` |
| `/shop/cart` | dynamic | `src/app/shop/cart/page.tsx` | guest + logged-in cart; `/cart` is a 307 thin redirect |
| `/shop/checkout` | dynamic | `src/app/shop/checkout/page.tsx` | product + mods checkout; `/checkout` is a 307 thin redirect |
| `/api/auth/*` | API | `src/app/api/auth/[...all]/route.ts` | Better Auth |
| `/robots.txt`, `/sitemap.xml` | — | `src/app/robots.ts`, `src/app/sitemap.ts` | sitemap includes product slugs |

`/thanks`, `/services/keyboard`, `/services/[device]/[slug]`, `/repair` are GONE (404 — removed 2026-09-06 / D-022). Thin 307 redirects `/cart`, `/checkout`, `/profile→/account/profile`, `/order/success/[orderNumber]` are INTENTIONAL legacy-compat wrappers — do not delete.

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

## Known soft-404 trap — RESOLVED (2026-09-06)

A `loading.tsx` in `/shop` or `/product/[slug]` caused `notFound()` to return **HTTP 200** (soft-404; confirmed `/product/does-not-exist-xyz` → 200, and `notFound()` in `generateMetadata` does NOT rescue the status once the loading shell has streamed). Fixed by removing both `loading.tsx` files (and the orphaned `ProductPageSkeleton`/`ShopGridSkeleton`); `generateMetadata` still calls `notFound()` pre-render to drive the 404 UI. Both bogus slugs now hard-404. `error.tsx` is fine (does not mask 404s). If a `loading.tsx` is ever re-added to a 404-capable route, re-verify.