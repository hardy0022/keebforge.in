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

## One-paragraph summary

KeebForge.in is the production website for a Bangalore-based mechanical-keyboard repair / custom-build business. It was rebuilt from scratch (Next.js 16 App Router) on top of two abandoned starter projects: a static HTML site (`static.keebforge.in`, the old public site) and a Next.js starter (`order.keebforge.in`, used only as a design/content reference). The new build is a live-data application: Prisma → Supabase PostgreSQL, Better Auth for authentication, Resend for email, Razorpay for payments (Phase 6), Cloudinary for media (pending credentials). All prices come from the database, not hardcoded values.

## State at a glance (2026-08-20)

- **Complete:** Foundation (Phase 3), all content pages (Phase 4), full security/pricing/SEO audit (Phase 4.5), shop + cart (Phase 5), Better Auth migration (replaces Supabase Auth), admin Phase 1 (auth + login, sidebar shell, dashboard, orders list/detail, tracking cache), product/shop management Phase 1+2 (categories/brands/products CRUD, variants, inventory ledger, CSV export/import, dashboard product metrics).
- **Verified:** `typecheck`, `lint`, `build` all green; admin routes 200 when authenticated and 307→`/login` when not; shop + product pages render seeded catalog; server actions for status/inventory/variants/categories/brands; export CSV; auth sign-up/sign-in/session/sign-out end-to-end against the live DB.
- **Seeded:** 8 brands + 11 demo products (with images/prices/stock/specs) so the shop is exercisable — replace with real inventory via the admin.
- **Blocked / pending:** Cloudinary integration needs real API credentials (upload route returns 501 until set); Razorpay keys are placeholders (checkout payment in Phase 6); Dash ownership verification needs a production deployment; customer shop Phase 3 (variant picking, brand pages, wishlist, reviews submission) and checkout Phase 4 remain.

## Golden rules (see each doc for detail)

1. Money is **integer paise**, never floats. `formatINR()` is the only display formatter.
2. **Never `prisma migrate dev`** — write manual migration SQL and `migrate deploy`. See `03-database.md`.
3. **Never auto-provision ADMIN.** Roles are explicit; admin is granted manually. All authorization is server-side.
4. Public pages are server-rendered with `cache()`; client components are used only where interaction is unavoidable (cart qty, admin forms, login, admin shell, order detail). Admin client components must never import from a `server-only` module — see `10-gotchas.md` G-015.
5. `.env` is never committed; `.env.example` holds variable names only.