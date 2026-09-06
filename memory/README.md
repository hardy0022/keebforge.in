# KeebForge.in — Project Memory

**Read this first.** This folder is the single source of truth for anyone (a human or an AI) picking up this codebase: what the site is, what has been done and **why**, the current state, and what comes next.

Project root: `/home/shadow269/WORKSTATION/GITHUB/KEEBFORGE/keebforge.in`

## How to use this folder

Start with `01-project-scope.md`. Then, depending on what you're doing:

| You're working on… | Read |
|---|---|
| Understanding the site's purpose | `01-project-scope.md` |
| The tech stack and where code lives | `02-architecture.md` |
| Database / Prisma / migrations | `03-database.md` |
| Login / auth / Dash / session | `04-auth.md` |
| Pages, redirects, SEO | `05-routes-seo.md` |
| Why a decision was made | `06-decisions.md` |
| What has already been built | `07-completed-work.md` |
| What's next / blocked items | `08-roadmap.md` |
| Env vars, commands, deployment | `09-env-ops.md` |
| Known traps that waste time | `10-gotchas.md` |
| Detailed work reports (caching, cleanup) | `reports/*.md` |

## One-paragraph summary

KeebForge.in is the production website for a Bangalore-based mechanical-keyboard repair / custom-build business. It was rebuilt from scratch (Next.js 16 App Router) on top of two abandoned starter projects: a static HTML site (`static.keebforge.in`, the old public site) and a Next.js starter (`order.keebforge.in`, used only as a design/content reference). The new build is a live-data application: Prisma → Supabase PostgreSQL, Better Auth for authentication, Resend for email, Razorpay for payments (test mode, live keys pending), Cloudinary for media (live, e2e-verified). All prices come from the database, not hardcoded values.

## State at a glance (2026-09-06)

- **Complete:** Foundation (Phase 3), all content pages (Phase 4), security/pricing/SEO audit, shop + cart + product PDP, Better Auth (dedicated `/auth/login` + `/auth/register`), admin (orders, products/categories/brands/variants/inventory, CSV, dashboard), customer account (`/account`), Cloudinary media system, `/mods` shipping quoting + direct Pay & Confirm → `/checkout`, `/workshop` intake, Razorpay EMI² affordability widget, live Delhivery admin shipment creation, and the **full production-grade cleanup/refactor (2026-09-06)** — dead code/deps removed, duplication merged, `app/(public)/` route group, `lib/caching/` + prettier added, and the `loading.tsx` soft-404 bug fixed (G-003).
- **Formatting now enforced:** every source file has been through `prettier --write .` (`.prettierrc.json`, `printWidth 80`). Keep it that way — run `npm run format` before committing touched files. `memory/` is prettier-ignored.
- **Delhivery logistics live in admin (2026-09-04):** one-click "Create shipment (Delhivery)" manifests real shipments (waybill = tracking number). Pickup location is configured in Admin → Settings → Shipping — that DB value is the source of truth (G-025). `/mods` defaults to "I'll ship the device" and hides Pay & Confirm until shipping is quoted.
- **Verified:** `typecheck`, `lint` (0 errors / 14 intentional `<img>` warnings), `build` all green; bogus product/category slugs return **404** (soft-404 fixed); public route smoke green.
- **Blocked / pending:** Razorpay keys are test placeholders (webhook verification + live keys pending — roadmap); **Dash ownership verification blocked on a Vercel apex→www 308 redirect** (roadmap); OAuth production callback URIs must be registered in provider consoles; shop Phase 3 remainder (variant picking, brand pages, wishlist, review submission).
- **Naming:** `/services` → `/mods`, `/repair` → `/workshop` (old URLs 307); per-service detail pages removed (D-022).

## Golden rules (see each doc for detail)

1. Money is **integer paise**, never floats. `formatINR()` (₹ + 2dp) and `formatPaiseWhole()` (whole rupee, no ₹) are the only formatters in `src/lib/money.ts`.
2. **Never `prisma migrate dev`** — write manual migration SQL and `migrate deploy`. See `03-database.md`.
3. **Never auto-provision ADMIN.** Roles are explicit; admin is granted manually. All authorization is server-side.
4. Public pages are server-rendered with `cache()`; client components are used only where interaction is unavoidable (cart qty, admin forms, login, admin shell, order detail). Admin client components must never import from a `server-only` module — see `10-gotchas.md` G-015.
5. `.env` is never committed; `.env.example` holds variable names only.
6. **Never re-add `loading.tsx` to `/product/[slug]` or `/shop`** — it causes soft-404s (G-003). Prettier + the shared helpers (`formatPaiseWhole`, `slugify`, `istDayKey`) are single-source; reuse them, don't copy.

## State at a glance (historical, 2026-08-24)

- Same stack; previously listed `/services`/`/repair` naming + cart-backed checkout — superseded by the 2026-09-06 cleanup once refactor mapped URLs to `/mods` + `/workshop` and moved static pages into `(public)/`.