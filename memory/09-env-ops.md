# 09 — Environment, Commands & Operations

## Environment variables

See `.env.example` for the authoritative list with names only. Secrets live in `.env` (never committed).

**Public (browser-safe, `NEXT_PUBLIC_*`):**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — used only by the (now-removed) Supabase auth; check before deleting from env/docs once no code references them.
- `NEXT_PUBLIC_APP_URL` — canonical dev origin (`http://localhost:3000`). **On Vercel (Production) this must be `https://keebforge.in`** and a redeploy is required after changing it (inlined at build).

**Server-only:**
- `DATABASE_URL` — Supabase pooled connection (port 6543). **Value in `.env` is quoted and the password contains a literal `@6969@`.**
- `DIRECT_URL` — direct connection (port 5432), for CLI ops.
- `SUPABASE_SERVICE_ROLE_KEY` — server-side admin access to Supabase project APIs.
- `BETTER_AUTH_SECRET` — 32-char secret (generated 2026-08-19). Rotate freely; sessions invalidate.
- `BETTER_AUTH_URL` — dev `http://localhost:3000`; **prod `https://keebforge.in`** (canonical apex, NOT www — set in the Vercel Production env; `.env.example` documents the apex value). Better Auth uses it only when `NODE_ENV === "production"`.
- `BETTER_AUTH_API_KEY` — Dash dashboard API key (set; ownership verification blocked on the Vercel apex→www redirect — see `08-roadmap.md`).
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` — OAuth creds (set in `.env`). Provider consoles must register the callback URI `https://keebforge.in/api/auth/callback/google` (+ `/discord`) for production, plus `http://localhost:3000/api/auth/callback/...` for dev.
- `RESEND_API_KEY`, `EMAIL_FROM` — verified working (contact form returns 200).
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — placeholders; Phase 6.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — **NOT set; pending credentials.**

Rules: never log env values, never pass secrets to client components, never commit `.env`.

## Commands

```bash
npm run dev            # local dev server (port 3000)
npm run build          # production build (Turbopack) — run before finishing work
npm run start          # serve production build
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
npm run db:generate    # prisma generate
npm run db:deploy      # prisma migrate deploy (USE THIS, not migrate dev)
npm run db:seed        # tsx prisma/seed.ts (idempotent)
npm run assets:optimize# node scripts/optimize-assets.mjs
```

## Standard verification workflow (done after every significant change)

1. `npx prisma validate` (if schema changed)
2. `npm run typecheck`
3. `npm run lint`
4. `npm run build`
5. Route + behavior smoke tests against a running dev server (curl). For server actions, replay the Next action-protocol POST (`$ACTION_REF_1`, `$ACTION_1:0`, `$ACTION_1:1`, `$ACTION_KEY`).
6. If the schema changed: check `prisma migrate status`.

## Deployment notes

- Target: https://keebforge.in (deployed on Vercel; remote `origin` = github.com/hardy0022/keebforge.in.git, single initial commit "UNDER MAINTENANCE"). No CI/CD configured in the repo.
- **Vercel domain gotcha:** the dashboard has `keebforge.in` redirecting to `www.keebforge.in` (308 for every path incl. `/api/*`). This broke the Better Auth Dash connection test ("server returned a redirect"). Fix in the Vercel dashboard: make `keebforge.in` the primary/serving domain with no redirect; set Production env `BETTER_AUTH_URL` + `NEXT_PUBLIC_APP_URL` to `https://keebforge.in`; redeploy.
- Before claiming auth/dash live in prod: `/api/auth/*` must respond **without redirect** (expect 401 on `/api/auth/dash/validate` and `/api/auth/me`); complete Dash ownership verification; confirm cookies are `secure` in prod.
- `robots.txt` disallows admin/account/checkout/api/track — re-check after adding those routes.

## Repo hygiene

- This directory **is** a git repository (was initialized during rollout): branch `main`, remote `origin` → `https://github.com/hardy0022/keebforge.in.git`, one initial commit `fa12b16` "UNDER MAINTENANCE". Commit state does NOT track the full history — treat git as a snapshot, not the source of truth (this folder + the deployed site are).
- `.gitignore` covers `.env`, `.next`, `node_modules`.
- Keep `.env.example` in sync whenever env vars change — it's the only safe place future developers/AIs can learn variable names.