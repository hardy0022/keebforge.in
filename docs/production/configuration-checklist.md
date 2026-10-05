# Production Configuration Checklist (Read-Only Verification)

**Status:** UNVERIFIED for all items. Verification requires separately authorized read-only review of deployment configuration. No secrets are to be inspected or printed.

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

## Verification procedure (read-only)
1. Review deployment platform configuration without printing secrets.
2. Confirm keys exist (presence check only). Do not read values.
3. Confirm domains/origins match production.
4. Document verification outcome per item.
5. Any missing/incorrect item is a P0 blocker until corrected.
