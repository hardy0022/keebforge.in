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

## G-003 — `loading.tsx` causes soft-404 (HTTP 200 on `notFound()`)
Never add a `loading.tsx` to `/shop` or `/product/[slug]` without re-verifying unknown slugs return 404. `error.tsx` is safe.

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