# Production Configuration Checklist (Read-Only Verification)

**Status:** PARTIALLY VERIFIED. As of 2026-10-11 the scheduled-reconciliation variables (`CRON_SECRET`, `PAID_NOTIFICATION_RECONCILE_SINCE`) and the cron registration are presence-verified in Production. All other items remain UNVERIFIED. Verification requires separately authorized read-only review of deployment configuration. No secrets are to be inspected or printed.

## Database
- [ ] DATABASE_URL (connection) — Purpose: app DB connectivity. Config: deployment env (Vercel/Supabase). Verify: format/target, not local/scratch; no secret values exposed.
- [ ] DIRECT_URL (direct connection) — Purpose: Prisma direct access. Config: deployment env. Verify: distinct from pooled if used; correct endpoint.
- [ ] Connection role — Purpose: effective DB role. Config: deployment env (credential). Verify: identified without exposing credentials (UNVERIFIED).

## Better Auth
- [ ] BETTER_AUTH_SECRET — Purpose: session signing. Config: deployment env. Verify: present (non-secret check only). UNVERIFIED.
- [ ] BETTER_AUTH_URL / base URL — Purpose: auth callbacks/origins. Config: deployment env. Verify: matches production domain. UNVERIFIED.
- [ ] NEXT_PUBLIC_BETTER_AUTH_IDENTIFY_URL — Purpose: sentinel client identify URL. Config: deployment env/build. Verify: correct endpoint. UNVERIFIED.
- [ ] Trusted origins / CORS — Purpose: prevent auth origin abuse. Config: deployment/env. Verify: production origins only. UNVERIFIED.

## Razorpay
- [ ] RAZORPAY_KEY_ID — Purpose: API access. Config: deployment env. Verify: production key. UNVERIFIED.
- [ ] RAZORPAY_KEY_SECRET — Purpose: API signing. Config: deployment env. Verify: present. UNVERIFIED.
- [ ] RAZORPAY_WEBHOOK_SECRET — Purpose: webhook signature validation. Config: deployment env. Verify: present and matches webhook endpoint. UNVERIFIED.
- [ ] RAZORPAY_WEBHOOK_URL — Purpose: webhook endpoint configuration. Config: deployment/env. Verify: correct production URL. UNVERIFIED.

## Email (Resend)
- [ ] RESEND_API_KEY — Purpose: transactional emails. Config: deployment env. Verify: present. UNVERIFIED.
- [ ] RESEND_FROM_EMAIL — Purpose: sender identity. Config: deployment env. Verify: verified domain. UNVERIFIED.

## Cloudinary
- [ ] CLOUDINARY_CLOUD_NAME — Purpose: media. Config: deployment env. Verify: correct cloud. UNVERIFIED.
- [ ] CLOUDINARY_API_KEY — Purpose: API. Config: deployment env. Verify: present. UNVERIFIED.
- [ ] CLOUDINARY_API_SECRET — Purpose: API. Config: deployment env. Verify: present. UNVERIFIED.

## Delhivery
- [ ] DELHIVERY_API_KEY — Purpose: shipping. Config: deployment env. Verify: present. UNVERIFIED.
- [ ] DELHIVERY_SECRET_KEY — Purpose: shipping auth. Config: deployment env. Verify: present. UNVERIFIED.
- [ ] DELHIVERY_BASE_URL — Purpose: API endpoint (staging/prod). Config: deployment env. Verify: correct for prod. UNVERIFIED.

## Application
- [ ] NEXT_PUBLIC_APP_URL — Purpose: public URLs. Config: deployment env. Verify: production domain. UNVERIFIED.
- [ ] ADMIN_PANEL_PRODUCTION_ENABLED — Purpose: admin access gating. Config: deployment env. Verify: correct for prod. UNVERIFIED.
- [ ] NODE_ENV — Purpose: runtime mode. Config: deployment. Verify: production. UNVERIFIED.

## Scheduled paid-order reconciliation (Vercel Cron)
Verified present in the Production scope on 2026-10-11 (presence check only, values not read).
- [x] CRON_SECRET — Purpose: authenticates `GET /api/cron/reconcile-paid-notifications`
  (`Authorization: Bearer $CRON_SECRET`). Config: deployment env, Production only. The route
  fails closed (HTTP 500) when unset and returns 401 on a bad/absent header. Verify: present;
  never commit or print the value. VERIFIED (presence, 2026-10-11).
- [x] PAID_NOTIFICATION_RECONCILE_SINCE — Purpose: only paid orders created on or after this
  ISO-8601 instant are eligible for the scheduled backfill, so the historical backlog is never
  auto-queued. The route fails closed (HTTP 500) when missing or invalid. Verify: present and a
  valid timestamp. VERIFIED (presence, 2026-10-11).
- [ ] PAID_NOTIFICATION_RECONCILE_LIMIT — Optional per-run cap, clamped to a hard maximum of
  100; unset means 100. Verify: omitted or within range. UNVERIFIED.
- [ ] Cron registration — Purpose: the schedule exists on the project. Config: `vercel.json`
  (`"crons"`, `0 3 * * *`; Hobby allows once-per-day only). Verify: project cron list shows
  `/api/cron/reconcile-paid-notifications`. VERIFIED (registered, 2026-10-11).

## On-demand cache revalidation (Preview/Production share one database)
Preview and Production share one `DATABASE_URL`, but each deployment has its own Next.js data
cache. An admin edit made on localhost/Preview cannot purge Production's cache with the in-process
tag invalidation, so the cache helpers forward the changed tags to `POST /api/revalidate` on
`REVALIDATE_PRODUCTION_URL`. The route accepts only allow-listed tags and absolute paths.
- [ ] REVALIDATE_SECRET — Purpose: authenticates `POST /api/revalidate`
  (`Authorization: Bearer $REVALIDATE_SECRET`). Config: the deployment environment (Production
  included, so the route accepts the caller). The route fails closed (HTTP 500) when unset and
  returns 401 on a bad/absent header. Verify: present; never commit or print the value. UNVERIFIED.
- [ ] REVALIDATE_PRODUCTION_URL — Purpose: base URL the cache-invalidation helpers forward to
  (e.g. `https://keebforge.in`). Config: localhost/Preview only. Leave unset in Production, which
  skips the forward so it never calls back into itself. Verify: set locally, unset in Production.
  UNVERIFIED.

## Outbound email safety (optional, server-only)
All unset in production, which leaves every send going to its real recipient as before.
- [ ] EMAIL_SEND_DISABLED — when truthy, every outbound email is suppressed. Verify: unset in prod.
- [ ] EMAIL_TEST_RECIPIENT — when set to a valid address, all outbound email is redirected to it.
  Verify: unset in prod (never point at a customer).
- [ ] RESEND template IDs (`RESEND_TEMPLATE_*`) — optional template overrides; blank/missing means
  the inline HTML fallback is used. Verify: unset unless intentionally configured.

## Preview isolation (Preview scope only — leave unset)
This project shares one database URL and integration credentials between the Vercel Preview and
Production scopes, so Preview fails closed unless `VERCEL_ENV` is exactly `production` (or unset/local).
- [ ] PREVIEW_DATABASE_TARGETS — Preview-scope allowlist of approved database targets. Verify: unset
  until a separate Preview database exists.
- [ ] PREVIEW_DANGEROUS_OPERATIONS_ENABLED — truthy re-enables guarded Preview operations. Verify:
  unset until the Preview deployment has its own database and isolated credentials.

## Verification procedure (read-only)
1. Review deployment platform configuration without printing secrets.
2. Confirm keys exist (presence check only). Do not read values.
3. Confirm domains/origins match production.
4. Document verification outcome per item.
5. Any missing/incorrect item is a P0 blocker until corrected.
