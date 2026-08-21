# 06 — Decision Log (what & why)

Chronological record of significant decisions and the reasoning behind them. New decisions get appended at the bottom.

## D-001 — Money stored as integer paise
**What:** every monetary value is `Int` paise (₹12 = `1200`); floats never represent money.
**Why:** floating-point drift corrupts money. Integers are exact and make MySQL/Postgres storage trivial.

## D-002 — No auto-admin; explicit roles
**What:** new users are `CUSTOMER`. `ADMIN`/`STAFF` are granted explicitly (seed sets `shadow@keebforge.in` = ADMIN). All authorization is server-side.
**Why:** an auto-admin path is a privilege-escalation bug waiting to happen; explicit assignment keeps ownership clear.

## D-003 — Supabase as PostgreSQL only (auth migrated to Better Auth)
**What:** 2026-08-19: removed Supabase Auth (files + deps), adopted Better Auth 1.7.1 with Prisma adapter as the single auth authority. Dash plugin installed.
**Why:** single auth authority, no vendor lock on identity, self-contained sessions in our own tables, hosted admin dashboard. Full details in `04-auth.md`.

## D-004 — Manual Prisma migrations (never `migrate dev`)
**What:** migration SQL is written via `prisma migrate diff` against the live DB, stored in `prisma/migrations/<timestamp>_<name>/migration.sql`, applied with `prisma migrate deploy`.
**Why:** the shadow-database flow (`migrate dev`) fails in this setup (the `auth` schema interferes). The manual pattern has been proven 6 times.

## D-005 — Database-driven pricing, never hardcoded
**What:** all prices and pricing prose render from DB. Hardcoded ₹ values were removed from `src/app/page.tsx`, `src/app/repair/keyboard/page.tsx` (file since removed — D-019), and `src/lib/faq.ts`. Helpers: `formatServicePriceText()` (`src/lib/orders.ts`) and `buildKeyboardFaq(priceText)` (`src/lib/faq.ts`).
**Why:** the audit found hardcoded prices drifting from the DB (e.g. FAQ said ₹12/SK while DB said ₹13). One source of truth prevents drift.

## D-006 — Order snapshots instead of live references
**What:** `Order` stores `customerName/customerEmail/customerPhone` and `OrderItem`/`OrderService` snapshot name+price; `profileId`/`productId`/`serviceId` are nullable FKs.
**Why:** catalog/service edits must never rewrite order history. Guest checkout needs the snapshot regardless of account state.

## D-007 — Guest carts via `guestToken`, not forced login
**What:** `Cart` keys on `profileId` OR `guestToken`; guest cookie `kf_cart` is httpOnly, SameSite=lax, secure in prod, 30-day expiry. Server actions enforce stock server-side.
**Why:** forcing sign-up before adding to cart kills conversion; server-side checks keep the trust boundary.

## D-008 — Products start EMPTY (no fake inventory) — SUPERSEDED by D-014
**What (original):** product/brand tables are intentionally not seeded; shop shows clean empty states.
**Why (original):** fake inventory looks broken when real stock arrives; better to ship the machinery and let the owner add real products.
**Status:** superseded on 2026-08-20 — see D-014.

## D-009 — Removed `loading.tsx` from shop/product routes
**What:** deleted; only `error.tsx` remains.
**Why:** `loading.tsx` caused `notFound()` to return HTTP 200 (soft-404) — bad for SEO and correctness.

## D-010 — Case-variant redirects live in `src/proxy.ts`, not `next.config.ts`
**What:** `/About`, `/About/`, `/Review`, `/Review/` → lowercase routes via middleware (308).
**Why:** Next `redirect()` matching is case-insensitive; a `next.config` rule for `/About` would shadow the real `/about` route.

## D-011 — `@better-auth/sso` + `@better-auth/scim` installed (unused)
**What:** two optional Better Auth packages installed; `@better-auth/sso` also externalized in `next.config.ts`.
**Why:** `@better-auth/infra`'s dynamic imports of these packages are statically resolved by Turbopack → build fails if missing. They are never invoked (no SSO/SCIM configured).

## D-012 — `WorkProject.images` JSON is a temporary state
**What:** work images are stored as `{url, alt}[]` JSON; `/work` pages read it.
**Why (decision to change):** Cloudinary integration (pending creds) will replace this with a `WorkImage` model storing `cloudinaryPublicId`, `secureUrl`, `width`, `height`, `sortOrder`, `isPrimary`, `altText`. No binary blobs in Postgres.

## D-013 — `/checkout` is a real shell, not a placeholder
**What:** `/checkout` renders a genuine cart summary and links to `/contact`; 7 places already linked to it.
**Why:** shipping a 404 on a linked page was worse than a minimal real page. Payment UI lands in Phase 6.

## D-014 — Demo seed catalog (supersedes D-008)
**What:** the seed now creates 8 brands + 11 demo products with realistic prices/stock/images. Demo images reuse `/images/work/*` files.
**Why:** with the admin product system live, an empty shop had no way to be exercised or demos'd. Demo stock is clearly placeholder and replaceable via the admin. The out-of-stock demo product (`active:false`) still proves the shop hides it (404 on its slug).

## D-015 — `Product.status` is the workflow field; `active` mirrors it
**What:** a `ProductStatus` enum (DRAFT/ACTIVE/OUT_OF_STOCK/ARCHIVED) drives the admin workflow. `active` remains a boolean set to `status !== 'DRAFT' && !== 'ARCHIVED'`, so every pre-existing public query (`active: true`, e.g. `PRODUCT_LIST`) keeps working without touching the shop.
**Why:** adding status without breaking the existing public filtering would have meant rewriting the shop queries; the mirror keeps one source of truth (status) while leaving old code intact.

## D-016 — Product labels live in a client-safe module
**What:** `PRODUCT_TYPE_LABELS` / `PRODUCT_STATUS_LABELS` and the `ProductType`/`ProductStatus` re-exports moved to `src/lib/product-labels.ts` (no `server-only`, no Prisma).
**Why:** `admin-catalog.ts` starts with `import "server-only"` and is pulled into the admin client forms; the build fails with "server-only cannot be imported from a Client Component module" otherwise.

## D-017 — Canonical domain is apex `https://keebforge.in`; `/api/*` must never redirect
**What:** the canonical production origin is the apex domain (NOT www). Local `.env` stays dev-scoped (`http://localhost:3000`); the prod values (`BETTER_AUTH_URL=https://keebforge.in`, `NEXT_PUBLIC_APP_URL=https://keebforge.in`) live in the Vercel Production environment. The repo contains no www/apex redirect logic and must not gain any — in particular `/api/*` (Better Auth) must serve directly on the canonical domain.
**Why:** the Better Auth Dash connection test hit `https://keebforge.in/api/auth` and got a **308 to www** (a Vercel dashboard domain redirect, not app code), so dash reported "server returned a redirect". Canonical-domain redirects are acceptable for pages, but never for `/api/*` — auth endpoints break behind them.

## D-018 — Homepage is currently a maintenance page — SUPERSEDED
**What (original):** `src/app/page.tsx` rendered a "Website under maintenance" notice with a meta-refresh + button to `https://shop.keebforge.in/` (user-applied).
**Status:** superseded on 2026-08-20 — the maintenance page was removed and the full homepage rebuilt from the existing components (the original page.tsx was never committed — the repo's single commit already contained the maintenance page, and the `ReviewsMarquee`/`ReviewCard`/`/reviews` route had been pruned with it). The rebuilt homepage: `Hero` (with the broken `/services/keyboard` link fixed to `/services`), text marquee strip, DB reviews marquee (new `getApprovedReviews()` in `src/lib/data.ts`, using the surviving `.review-card`/`.reviews-*` CSS), all `ServiceSection` groups, `GENERAL_FAQ`, `CtaSection`. Verified typecheck/lint/build green + HTTP 200 with hero/reviews/FAQ rendered.

## D-019 — Single `/repair` page replaces `/repair/keyboard` + `/repair/mouse`; repair inquiry accepts photos
**What:** the two per-device repair pricing pages were removed; `/repair` is now the only repair route — an "Electronics Repair" card + the shared `InquiryForm`. The form and `sendInquiry` action gained optional photo upload (max 5, ≤5 MB, JPG/PNG/WEBP, client + server validation incl. magic-byte sniffing) uploaded to Cloudinary (`keebforge/repairs`) with URLs embedded in the Resend email. `next.config.ts` `/keyboard-repair`/`/mouse-repair` redirects now point at `/repair`; footer/header/sitemap updated. `serverActions.bodySizeLimit` raised to `30mb` (default 1 MB would reject 5 MB photos).
**Why:** the business's repair entry point is a single quote-based inquiry (repair is priced per-inspection, not per-service). Photos help assessment before the device ships. The email-only inquiry flow was kept (no DB tables) — Cloudinary URLs travel in the email until orders/persistence land (Phase 4).
**Note:** actual Cloudinary upload is untested — creds absent (`G-012`); the gated path returns a graceful "upload temporarily unavailable" error rather than blocking the inquiry.