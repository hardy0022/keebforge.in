# Production Configuration Checklist (Read-Only Verification)

**Status:** PARTIALLY VERIFIED. As of 2026-10-11 the scheduled-reconciliation variables (`CRON_SECRET`, `PAID_NOTIFICATION_RECONCILE_SINCE`) and the cron registration are presence-verified in Production. All other items remain UNVERIFIED. Verification requires separately authorized read-only review of deployment configuration. No secrets are to be inspected or printed. Names below were rechecked against the source tree on 2026-10-26; the complete variable map is in [`docs/code-map.md` §24](../code-map.md#24-environment-variables).

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
- [ ] NEXT_PUBLIC_RAZORPAY_KEY_ID — Purpose: browser checkout key. Config: deployment env/build. Verify: matches the production key. UNVERIFIED.
- [ ] RAZORPAY_WEBHOOK_SECRET — Purpose: webhook signature validation. Config: deployment env. Verify: present and matches the webhook endpoint. UNVERIFIED.
- [ ] Razorpay webhook endpoint (dashboard configuration, not an app env var) — Purpose: deliver payment/refund events to `/api/payments/webhook`. Verify: production URL and required events enabled. UNVERIFIED.

## Email (Resend)
- [ ] RESEND_API_KEY — Purpose: transactional emails. Config: deployment env. Verify: present. UNVERIFIED.
- [ ] EMAIL_FROM — Purpose: sender identity. Config: deployment env. Verify: verified domain. UNVERIFIED.
- [ ] RESEND_TEMPLATE_PASSWORD_RESET, RESEND_TEMPLATE_EMAIL_VERIFICATION, RESEND_TEMPLATE_CONTACT_INQUIRY, RESEND_TEMPLATE_REPAIR_REQUEST, RESEND_TEMPLATE_SHOP_ORDER_PAID, RESEND_TEMPLATE_MODS_ORDER_PAID — Purpose: required remote templates; there is no inline-HTML fallback. Verify: all six set and published. UNVERIFIED.

## Cloudinary
- [ ] CLOUDINARY_CLOUD_NAME — Purpose: media. Config: deployment env. Verify: correct cloud. UNVERIFIED.
- [ ] CLOUDINARY_API_KEY — Purpose: API. Config: deployment env. Verify: present. UNVERIFIED.
- [ ] CLOUDINARY_API_SECRET — Purpose: API. Config: deployment env. Verify: present. UNVERIFIED.

## Delhivery
- [ ] DELHIVERY_API_URL — Purpose: API base endpoint. Config: deployment env. Verify: correct production endpoint. UNVERIFIED.
- [ ] DELHIVERY_API_TOKEN — Purpose: shipping authentication. Config: deployment env. Verify: present. UNVERIFIED.
- [ ] DELHIVERY_ORIGIN_PINCODE — Purpose: warehouse origin. Config: deployment env. Verify: correct production pincode. UNVERIFIED.
- [ ] DELHIVERY_DEFAULT_MODE and DELHIVERY_MODES — Purpose: default/allowed service speeds. Config: deployment env. Verify: valid production modes. UNVERIFIED.
- [ ] DELHIVERY_SURFACE_DAYS and DELHIVERY_EXPRESS_DAYS — Optional ETA overrides; not in `.env.example`. Verify: unset or valid positive integers. UNVERIFIED.
- [ ] DELHIVERY_PICKUP_* — Pickup identity/address: `DELHIVERY_PICKUP_NAME`, `DELHIVERY_PICKUP_ADDRESS`, `DELHIVERY_PICKUP_CITY`, `DELHIVERY_PICKUP_PIN`, `DELHIVERY_PICKUP_STATE`, `DELHIVERY_PICKUP_COUNTRY`, `DELHIVERY_PICKUP_PHONE`, `DELHIVERY_PICKUP_EMAIL`, `DELHIVERY_PICKUP_ACCOUNT_NAME`. Purpose: pickup and return consignor. Verify: complete and production-correct. UNVERIFIED.
- [ ] DELHIVERY_PICKUP_RETURN_* — Return address: `DELHIVERY_PICKUP_RETURN_ADDRESS`, `DELHIVERY_PICKUP_RETURN_PIN`, `DELHIVERY_PICKUP_RETURN_CITY`, `DELHIVERY_PICKUP_RETURN_STATE`, `DELHIVERY_PICKUP_RETURN_COUNTRY`. Verify: complete and production-correct. UNVERIFIED.

## Application
- [ ] NEXT_PUBLIC_APP_URL — Purpose: public URLs. Config: deployment env. Verify: production domain. UNVERIFIED.
- [ ] NEXT_PUBLIC_GTM_ID — Optional analytics tag. Verify: correct production container or unset. UNVERIFIED.
- [ ] FREE_SHIPPING_THRESHOLD — Optional store-wide threshold in paise; supported in code but not in `.env.example`. Verify: intended production value or unset. UNVERIFIED.
- [ ] ADMIN_PANEL_ENABLED / ADMIN_PANEL_PRODUCTION_ENABLED — Purpose: admin panel master/production switch. Config: deployment env. Verify: intended production value. UNVERIFIED.
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
- [ ] RESEND template IDs (`RESEND_TEMPLATE_*`) — **required** for each email to send; there is no
  inline-HTML fallback. A blank/missing id makes that path refuse (paid sends fail as
  `template:not-configured`; inquiry/repair return an error; auth mails are skipped). Verify: all six
  ids set in prod (see `docs/resend-templates.md`).

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
