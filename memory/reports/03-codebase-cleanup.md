# Report 03 — Production-grade codebase cleanup & refactor (2026-09-06)

Full detail of the 5-phase cleanup pass. Summary + gotchas also live in `07-completed-work.md` and `10-gotchas.md` (G-003, G-031, G-032, G-033). Baseline: 277 files, ~31,724 lines in `src/`. Constraint: **no rewrites** — auth, payments, checkout, shipping, business logic, DB, and API contracts all preserved byte-identical semantics.

## Phase 1 — Audit

Read every memory doc + config (`package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `components.json`) and inventoried all of `src/` via search agents. Findings that shaped later phases:

- `/thanks` — 0 references anywhere (sitemap/robots/proxy/next.config) → **dead route**.
- `/cart`, `/checkout`, `/profile`, `/order/success/[orderNumber]` thin redirects are **intentional** legacy-compat wrappers — keep.
- `removeServiceFromCart` (`src/app/actions/cart.ts`) — 0 callers → dead.
- `POST /api/cart/service` — dead (only `DELETE` callers exist); `ORDER` branch in `/api/uploads` — dead (only PRODUCT form uploads).
- `isAdminRole` — display/redirect heuristic only, not real authz → dead.
- Delhivery: `expectedTat`, `fetchBulkWaybills`, `bookPickup` are network wrappers with no callers → delete; the `parse*` parsers are exercised by the file self-check → keep.
- 8 unused components (Marquee, Checklist, animated-grid-pattern, flickering-grid, tweet-card, ModSection, ShippingEstimator, ModPriceForm). tweet-card deletion makes `react-tweet` removable; 5 deps total to drop (`lucide-react`, `radix-ui`, `class-variance-authority`, `react-tweet`, `tw-animate-css`).
- Duplication: two `ActionForm`s (admin `<toastLabel>` vs orders `<okLabel>` — different render contracts), two identical `Spinner`s, two identical `types.ts`, 6 icons used only by home, `availableStock` ≡ `availableQuantity`, three `formatPaise`-style copies, two `slugify` copies, coupon IST-day-key copy.
- `environment.test.ts` is a **legit self-check** (like `coupon-eval`) → wire `check:environment`, don't delete.
- `@better-auth/scim` + `@better-auth/sso` MUST stay (G-006 — build-time dynamic imports by `@better-auth/infra`).
- `/reset-password` link broken in auth emails (redirects to a nonexistent route) → **reported, out of scope** (no auth changes allowed).

## Phase 3 — Execute deletions & dedup

See `07-completed-work.md` → "Production-grade codebase cleanup & refactor". Highlights: `/thanks` removed; 5 deps uninstalled; cache route rewritten to DELETE-only; uploads route narrowed to PRODUCT; `isAdminRole`, 2 seeds, `removeServiceFromCart` gone; `Spinner`, `slugify`, `formatPaiseWhole`, `istDayKey`, `availableStock`, the 6 icons all merged to single sources; two `loading.tsx` removed + the soft-404 fixed (G-003).

## Phase 2 — Structure

- `git mv src/lib/cache.ts → src/lib/caching/cache.ts`; 11 importers updated.
- New `app/(public)/` group for the 7 static info pages (URLs unchanged — route groups don't affect paths; confirmed in build route list).
- `revalidatePath("/cart")` → `revalidatePath("/shop/cart")` (the old target never invalidated the real page).
- `check:environment` script wired (`tsx src/lib/environment.test.ts`).

## Phase 4 — Formatting

Prettier added (`.prettierrc.json`: printWidth 80 / double-quote / semis / trailingComma all; `.prettierignore`: node_modules/.next/memory/package-lock/public). Ran `npm run format` once at the very end — mechanical ~239-file diff. No pre-commit hook; format manually per-change.

## Phase 5 — Verification

- `tsc --noEmit` clean; eslint **0 errors / 14 warnings** (all intentional `<img>` — see G-028; tweet-card removal dropped 1); build green (61/61 static); `check:environment` + `check:coupons` green.
- Runtime smoke (fresh `next start`): all public routes 200, `/services`/`/write-review`/`/admin` 307 (intended login/legacy redirects), `/thanks` 404, real product 200.
- **G-003 soft-404 fix**: `/product/does-not-exist-xyz` + `/shop/nope-category` returned **200** (route `loading.tsx` streamed the shell before `notFound()`; generateMetadata `notFound()` cannot rescue the status in Next 16/Turbopack). Removed both `loading.tsx`, deleted orphans, kept `notFound()` in generateMetadata → both slugs now hard **404**.
- Verified-unchanged: legacy thin redirects, delhivery parsers + TAT logic (self-check green), scim/sso deps (G-006).

## Known trade-offs

- Soft-404 fix means `/product/[slug]` and `/shop` no longer stream a loading skeleton — correct 404 semantics won; re-add a `loading.tsx` only after re-verifying bogus slugs (G-003).
- Admin catalog/analytics reads stayed uncached where aggregation freshness matters.
- `/reset-password` auth-email link remains broken (documented — needs an intentional auth change).