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

KeebForge.in is the production website for a Bangalore-based mechanical-keyboard repair / custom-build business. It was rebuilt from scratch (Next.js 16 App Router) on top of two abandoned starter projects: a static HTML site (`static.keebforge.in`, the old public site) and a Next.js starter (`order.keebforge.in`, used only as a design/content reference). The new build is a live-data application: Prisma → Supabase PostgreSQL, Better Auth for authentication, Resend for email, Razorpay for payments (test mode, live keys pending), Cloudinary for media (live, e2e-verified). All prices come from the database, not hardcoded values.

## State at a glance (2026-08-24)

- **Complete:** Foundation (Phase 3), all content pages (Phase 4), security/pricing/SEO audit, shop + cart + product PDP, Better Auth (dedicated `/auth/login` + `/auth/register` with real username claim + server-side password policy), admin Phase 1+2 (orders, products/categories/brands/variants/inventory, CSV, dashboard metrics), customer account area (`/account` profile + address book with name/email/landmark), Cloudinary media system (e2e-verified), `/mods` booking flow — 4-step configurator with live Delhivery quoting, pickup = 1.5× forward rule (D-023), direct Pay & Confirm → `/checkout` (D-024) — and `/workshop` custom-work intake. `/checkout` handles both product carts and mods stash: numbered 2-col layout, sticky Order Summary, shared AddressPicker cards (same UI as `/mods` Step 04), Razorpay test-mode modal verified opening.
- **Verified:** `typecheck`, `lint`, `build` all green; mods pay-flow E2E (surface ₹991.21 return-only / ₹1,308.21 pickup breakdowns, server charge matches display to the paise); address-card selection E2E on both pages (default preselect, mismatch → manual fallback, guest path); stale-quote + tamper protections.
- **Seeded:** 8 brands + 11 demo products so the shop is exercisable — replace with real inventory via the admin. Service catalog groups live in DB (admin-managed).
- **Blocked / pending:** Razorpay keys are test placeholders (webhook verification + live keys pending — see roadmap); **Dash ownership verification blocked on a Vercel apex→www 308 redirect** (fix steps in `08-roadmap.md`); OAuth production callback URIs must be registered in provider consoles; shop Phase 3 remainder (variant picking, brand pages, wishlist, review submission).
- **Naming:** `/services` → `/mods`, `/repair` → `/workshop` (old URLs 307); per-service detail pages removed (D-022).

## Golden rules (see each doc for detail)

1. Money is **integer paise**, never floats. `formatINR()` is the only display formatter.
2. **Never `prisma migrate dev`** — write manual migration SQL and `migrate deploy`. See `03-database.md`.
3. **Never auto-provision ADMIN.** Roles are explicit; admin is granted manually. All authorization is server-side.
4. Public pages are server-rendered with `cache()`; client components are used only where interaction is unavoidable (cart qty, admin forms, login, admin shell, order detail). Admin client components must never import from a `server-only` module — see `10-gotchas.md` G-015.
5. `.env` is never committed; `.env.example` holds variable names only.