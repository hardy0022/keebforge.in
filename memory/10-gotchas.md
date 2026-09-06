# 10 — Gotchas (traps that waste time)

Read this before touching anything. Each entry cost real debugging time once.

## G-001 — Prisma CLI rejects the connection URL from `.env`
`.env` stores `DATABASE_URL`/`DIRECT_URL` **quoted**, and the password contains a literal `@6969@`. The CLI's strict URL parser rejects both. When passing the URL to a CLI command:
```bash
URL=$(grep '^DIRECT_URL=' .env | cut -d= -f2- | tr -d '"')
URL=${URL//@6969@/%406969@}
```
The **app itself** connects fine with the raw value — this only affects CLI invocations.

## G-002 — Never `prisma migrate dev`
The shadow-database flow fails in this setup (`auth` schema interference). Use the manual diff + deploy pattern (see `03-database.md`). `migrate status` should always show all migrations applied.

## G-003 — `loading.tsx` causes soft-404 (HTTP 200 on `notFound()`) — resolved 2026-09-06
A `loading.tsx` on `/shop` or `/product/[slug]` streams its skeleton shell **before** the page's `notFound()` resolves, so the response commits headers with HTTP **200** and only carries a client-side `NEXT_HTTP_ERROR_FALLBACK;404` template. Critically, **`notFound()` in `generateMetadata` does NOT rescue the status** — metadata also runs after the loading shell has already streamed (verified against Next 16.3.1 / Turbopack: 200 with the fallback template inside). The fix that actually works:
1. Remove the `loading.tsx` (both `/product/[slug]/loading.tsx` and `src/app/shop/loading.tsx` are gone — their orphans `ProductPageSkeleton`/`ShopGridSkeleton` deleted).
2. Keep `notFound()` in `generateMetadata` anyway (it still emits the correct 404 UI/fallback on the client).
Verified after removal: `/product/does-not-exist-xyz` → **404**, `/shop/nope-category` → **404**, real products/categories stay 200. If a `loading.tsx` is ever re-added to a route that can 404, re-verify with a bogus slug. `error.tsx` is safe.

## G-004 — Next `redirect()` matching is case-insensitive
`/About` in `next.config.ts` would shadow the real `/about` route. Case-variant old URLs are handled **only** in `src/proxy.ts` (`CASED_PATHS` map, 308). Keep it that way.

## G-005 — `/Terms&Conditions` redirect only matches a literal `&`
URL-encoding it as `%26` in a request does **not** match the `next.config.ts` source. `curl --path-as-is "http://localhost:3000/Terms&Conditions"` works; the encoded form 404s. This is expected.

## G-006 — Turbopack resolves dynamic imports at build time
`@better-auth/infra` dynamic-imports `@better-auth/sso` and `@better-auth/scim`. If they're missing, `npm run build` fails with "Module not found". They're installed and never invoked (no SSO/SCIM). Keep them, or remove them **together with** the `dash()` plugin. `@better-auth/sso` is also in `next.config.ts` `serverExternalPackages`.

## G-007 — Better Auth CLI generated an incomplete schema
`npx @better-auth/cli generate` output was missing `Account.issuer`, which the runtime writes on every sign-up (caused a 500). `Account` must include `issuer String?` (`schema.prisma` + migration `20260819181000`). If auth schema is ever regenerated, re-verify against `getAuthTables`.

## G-008 — Sign-out / state-changing auth calls via curl return 403/415
Better Auth enforces CSRF on state-changing POSTs. curl must send `-H "Origin: http://localhost:3000"` (browsers always do) and sign-out additionally needs a `{}` JSON body. Without Origin → 403; without a body → 400 "Invalid JSON".

## G-009 — Auth endpoint is `/api/auth/get-session`, not `/api/auth/session`
`GET /api/auth/session` returns 404. Use `get-session`.

## G-010 — Stale dev server processes
A `next-server` can linger (even as root, unkillable from the current user) and hold port 3000. If `npm run dev` won't bind or requests hit old code, kill all `next-server`/`next dev` processes first. Smoke-test scripts should `setsid`-detach the server and kill its process group on exit (a plain `&` keeps the tool's pipe open and appears to hang).
**A root-owned `next-server` (PID 5872, v16.2.6) currently sits on port 3111 — `sudo kill 5872` to reclaim it.**

## G-011 — Server actions need the full action-protocol POST
To test server actions with curl you must replay the Next action protocol fields (`$ACTION_REF_1`, `$ACTION_1:0`, `$ACTION_1:1`, `$ACTION_KEY`) with the right encodings. Otherwise you'll test a 400, not your action.

## G-012 — Cloudinary vars are not set yet
Any work that calls Cloudinary will fail until `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` are in `.env`. The gated upload route returns **501 "Cloudinary is not configured"** — that is by design, not a bug. Architecture can be written; live uploads cannot be tested. Do not claim media work verified.

## G-013 — Dash ownership is not yet verified
The `dash()` plugin is configured with `BETTER_AUTH_API_KEY`, but ownership must be confirmed against the **production** site. Local results don't prove the production claim.

## G-014 — Next 16 `params`/`searchParams` are Promises
Every page must `await params` / `await searchParams` before use. Not awaiting → `Cannot read properties of undefined (reading 'join')` (or `'map'`) at runtime in pages that destructure them. All admin pages already do this; any new page must too.

## G-015 — `server-only` cannot be imported by a client component
Admin client forms (`ProductForm`, `ProductDetailClient`) need the type/label maps but must NOT import from `admin-catalog.ts` (which starts with `import "server-only"`). Build fails with "`server-only` cannot be imported from a Client Component module". Keep labels in `src/lib/product-labels.ts` (D-016). Importing a `"use server"` actions file from a client component is fine.

## G-016 — Dev server caches the Prisma client
If the dev server was started before `prisma generate`/a migration, it keeps the old client in memory and queries fail with "Unknown field `status` for select statement" etc. **Restart the dev server after any schema change** (`prisma generate` alone is not enough).

## G-017 — Controlled inputs must keep action-expected names
`saveProduct` reads `formData.getAll("imageUrl")` / `"imageAlt"` / `"imageOrder"` + `"imagePrimary"`. The `ProductForm` image inputs were originally named `imageUrl-${i}` → images silently never persisted. Array-style same-name inputs (in DOM order) are what the action zips. Any form input consumed by a server action must match the action's expected name exactly.

## G-018 — Vercel's apex→www domain redirect breaks `/api/*` (and Dash)
`https://keebforge.in/api/auth` returned **308 → www** for every path, and the Better Auth Dash connection test failed with "server returned a redirect". This is a **Vercel dashboard Domains setting**, not app code — the repo has no www/apex redirect logic (`src/proxy.ts` excludes `api/`, no `vercel.json`, no middleware). Canonical-domain redirects must never cover `/api/*`: auth endpoints break behind them. Fix in the Vercel dashboard (see `08-roadmap.md`), not in the repo.

## G-019 — Bare `GET /api/auth` returns 404 and that's normal
The auth route is `app/api/auth/[...all]/route.ts`; a catch-all requires ≥1 segment, so `/api/auth` alone 404s. Health-check auth with `/api/auth/me` or `/api/auth/dash/validate` instead — both return **401** when the plugin/route is live. A 401 on dash endpoints is the "connected" signal, not an error.

## G-021 — styled-jsx in a client component causes hydration mismatch under Turbopack
`AdminShell.tsx` used a `<style jsx>` block with `@media` queries. Turbopack emitted the scoped `jsx-<hash>` class on the server but not on the client → "A tree hydrated but some attributes of the server rendered HTML didn't match". The block was moved to `globals.css` as plain media queries (`.kf-sidebar-desktop`, `.kf-mobile-sidebar`, `.kf-drawer-open`, `.kf-sidebar-toggle`, `.kf-admin-main`). **Rule: no `<style jsx>` in client components — put responsive rules in `globals.css`.**

## G-020 — `NEXT_PUBLIC_*` is inlined at build time
Changing `NEXT_PUBLIC_APP_URL` on Vercel requires a **redeploy** to take effect; server-only vars (`BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, API keys) are read at runtime and don't need a rebuild. If prod canonicals/OG URLs look wrong after an env change, the build didn't pick up the new value.

## G-022 — Delhivery cmu body is URL-encoded form data, NOT JSON
`/api/cmu/create.json` wants `Content-Type: application/x-www-form-urlencoded` with body `format=json&data=<JSON>`. Sending `application/json` with `JSON.stringify("format=json&data=…")` (a double-serialized string) → Delhivery: `{"rmk":"format key missing in POST"}`. The odd-but-working path is `body: buildCreateShipmentBody(input)` raw. Special chars `& # % ; \` must be stripped from string fields first — `clean()` in the builder exists exactly for this.

## G-023 — "ClientWarehouse matching query does not exist" is a config error, not code
When manifesting, `pickup_location.name` must exactly match a warehouse already registered in the Delhivery system for the account. Empty/wrong name produces this `rmk`. There's no way to guess it — register via `clientwarehouse/create/` (or the admin Settings → Shipping Pickup Location card, which does create+edit). Before: `DELHIVERY_PICKUP_*` env was missing entirely, so the manifest failed here even though the API call "worked".

## G-024 — Successful cmu responses put the waybill in `packages[].waybill`
The 200 manifest response is shaped `{packages:[{waybill, refnum, client,…}], upload_wbn:"UPL…", …}` — the tracking number is per-package `packages[0].waybill`, NOT the `upload_wbn` (which starts with `UPL`). `parseCreateShipmentResponse` reads both `packages[]` and `shipments[]` because older/other API surfaces use the `shipments` key. If you see "cmu response without waybill" after a 200, check which key actually carries it.

## G-025 — Pickup location is stored in the DB (Settings), env vars are just fallback
`createShipmentDelivery` reads `SiteSetting` key `delhivery_pickup` first (set from Admin → Settings → Shipping), then `DELHIVERY_PICKUP_*` env, then `DELHIVERY_ORIGIN_PINCODE`. If a manifest suddenly fails with warehouse errors after the env changed, the Settings card value is the source of truth — check Settings, not `.env`.

## G-026 — Delhivery cmu payload traps that make manifests "work but look broken"
- **Every** address string in the cmu `data` payload must be `clean()`ed (strips `& # % ; \`) — the body is `format=json&data=…` form-encoded, so an unescaped `&` (e.g. state "Jammu & Kashmir") breaks JSON parsing → Delhivery returns `rmk: "Unterminated string starting at: line 1 column … / Package might be saved …"`. This bit the `return_*` fields and `pickup_location` (originally added NOT cleaned, after the rest already was). Never add a new address field to the builder without running it through `clean()`, and keep the `no form-breaking chars in data payload` self-check assertion true.
- Even on this parse error Delhivery can **save the package anyway** ("Package might be saved"). Combine tolerance for `error:true`+`rmk` with the double-manifest guard in `createShipmentDelivery` (`order.shipment.trackingNumber` → refuse early). The action surfaces Delhivery's own `rmk` in the error toast so the operator decides, instead of the old generic "no waybill" + blind re-click.
- Must send **all three** dimensions (`shipment_length/width/height`). Omitting length makes the Delhivery dashboard render `0 x W x H`. Both dims and `weight` must be positive; defaults 20cm / order's `shippingWeightGrams`.
- **Never send `total_amount` 0 for REPAIR orders** — `Order.total` is 0 until invoiced. `createShipmentDelivery` derived declared value = `max(order.total, repair.quotePrice, summary.budget)`. A `₹0` manifest means a REPAIR with no budget/quote and no manual value entered.
- **`weight` must be the `"<n> gm"` string format**; bare `"55"` shows as "NA" weight in the Spend/transaction view.

## G-027 — Calling `useActionState`'s `formAction(fd)` imperatively must use `startTransition`
- Invoking the returned action outside a transition throws: "An async function with useActionState was called outside of a transition … isPending will not update correctly" (React 19 / Next 16 console error).
- Only two legitimate call sites exist and they BOTH must be safe: (a) pass the function to a `<form action={…}>` / `<formAction>` prop (React owns it), (b) imperative calls inside `startTransition(() => formAction(fd))`.
- Anti-pattern found & fixed in `src/components/support/TrackOrder.tsx`: an `onSubmit` handler did `e.preventDefault(); formAction(fd)`. Converted to `<form action={formAction}>` + hidden `waybill` input (dropped the manual `load` fn and a `loaded` state, label driven by `state.ok`). The auto-track on mount (`reTrack`) and the post-pay refresh both wrapped in `startTransition`. If you add a tracker/order lookup later, bind forms to the action prop rather than calling it in handlers.
## G-028 — The no-img-element lint warnings are intentional (now 14)
`@next/next/no-img-element` reports 14 warnings: ReviewForm blob previews, ReviewBody modal images, ReviewCard avatar (the tweet-card one disappeared when `tweet-card.tsx` was deleted 2026-09-06). Deliberately NOT `next/image` — no bandwidth/LCP payoff and converting risks breakage. Don't "clean up" them without a real reason.

## G-029 — `/checkout` (no path) redirects; the real page is `/shop/checkout`
`src/app/checkout/page.tsx` is a one-line `redirect("/shop/checkout")` wrapper. A curl/health check of `/checkout` returns **307**, which is correct existing behavior — probe `/shop/checkout` instead (200).

## G-030 — Action-state forms must bind via `form action`, never manual invocation
Covered G-027 for `useActionState`. Applies to any wrapped action: if a form manually builds `FormData` and calls the action in `onSubmit`, React warns and `isPending` breaks. Bind `<form action={…}>` and drop the manual call. (One exception: JSON-orderAmounts-style conversions that pass `prevState` — those keep a single wrapped `formData → void` action.)

## G-031 — Prettier reformats the whole repo (only run when intended)
`.prettierrc.json` (`printWidth: 80`, no single-quote, semis) + `npm run format` will touch ~239 files site-wide. It's wired as a one-shot `format` script, NOT a pre-commit hook. Run it only after the code is behavior-frozen. `memory/` and `.next/` are in `.prettierignore`. A stale `@/lib/cache` import path is a sure sign `git mv`-ing `src/lib/cache.ts` broke an importer (see G-032).

## G-032 — `lib/cache.ts` lives at `@/lib/caching/cache`
On 2026-09-06 `src/lib/cache.ts` was renamed to `src/lib/caching/cache.ts` (~11 importers updated to `@/lib/caching/cache`). Any new import must use the new path. Check here if a build error says a `cache` module can't be found.

## G-033 — Formatting after bugs: `formatPaiseWhole`, `slugify`, `istDayKey` are the single sources
The refactor merged several one-off formatters — reuse these before writing a new one:
- `src/lib/money.ts` `formatPaiseWhole(paise)` — whole-rupee "123" (no ₹, no decimals) for `₹`-prefixed labels; drives `mods/pricing.ts`, `ModConfigurator`, `RevenueOrdersChart`. `formatINR()` (with ₹ + 2dp) is for headline money display. Business rule (D-001): integer paise everywhere, round before formatting.
- `src/lib/slugify.ts` `slugify(s, {stripQuotes?, maxLength?, fallback?})` — combines the two old private fns; `stripQuotes` = admin product catalog, `maxLength`+`fallback` = work projects.
- `src/lib/ist.ts` `istDayKey(d)` — the canonical en-CA "YYYY-MM-DD" IST day key; the coupon manager's duplicate inline copy was removed.
