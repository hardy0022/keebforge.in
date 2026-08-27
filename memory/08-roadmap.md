# 08 — Roadmap & Pending Work

Ordered roughly by dependency. Items marked BLOCKED need external input.

## Customer shop & checkout (Phases 3+4) — partially DONE (2026-08-24)

Shipped: real `/checkout` for both product carts and mods direct-pay (Razorpay test-mode modal, verified end-to-end), mods booking flow with live Delhivery quoting + pickup 1.5× rule (D-023), shared AddressPicker cards on `/mods` + `/checkout`, address book with name/email/landmark. Remaining:

- **Phase 3 — Shop:** variant picking on `/product/[slug]`, brand shop pages (`/shop/brand/[slug]`), wishlist, review submission (post-order, `Review.orderId` unique, moderation gate).
- **Phase 4 — Checkout:** coupon codes, **inventory reservation** (`reservedQuantity` on product/variant) and release-on-cancel/refund, Razorpay webhook verification + live keys, transactional email (Resend), `OrderTimeline`/`Tracking` cache writes.
- Cart completion: merge guest cart into profile cart on sign-in.

## Cloudinary media — DONE (2026-08-24)

Credentials are set and the full system is live and e2e-verified (see `07-completed-work.md`). Upload API: `/api/uploads` POST/DELETE. Folders: `keebforge/products/{id|drafts/{token}}`, `keebforge/services/{id}`, `keebforge/repairs/{orderNumber}/{role}`, `keebforge/orders/{id}`; `Media` table covers non-product entities, `ProductImage.publicId` covers products. Remaining niceties only: a `WorkImage` model if work-portfolio images ever need per-image metadata (the `WorkProject.images` JSON accepts Cloudinary URLs as-is), and an auth-gated proxy if customer repair photos must become truly private.

## Dash ownership verification

**BLOCKED on a Vercel domain-level redirect, not on code.** `https://keebforge.in/api/auth` 308-redirects to www (set in the Vercel dashboard Domains settings); the repo has no redirect logic for this. Unblock by (in order):

1. Vercel → Project → Settings → Domains: set `keebforge.in` as the serving (primary) domain with **no "Redirect to www"** (point www → keebforge.in if you want www canonicalized).
2. Vercel → Settings → Environment Variables → **Production**: `BETTER_AUTH_URL=https://keebforge.in`, `NEXT_PUBLIC_APP_URL=https://keebforge.in`.
3. Redeploy (required — `NEXT_PUBLIC_*` is inlined at build).
4. Register `https://keebforge.in/api/auth/callback/google` and `.../callback/discord` in Google Cloud Console + Discord dev portal.

Then verify: `curl -I https://keebforge.in/api/auth/dash/validate` → **401 (not 308)**; re-run the dash connect check; test sign-up/sign-in/sign-out, `/api/auth/me`, Google OAuth, and admin login. Do **not** claim "Dash verified" until that's green in production.

## Review & tracking (remaining Phase 7 items)

- Post-order review submission UI (model + moderation gate already in place).
- Warranty records and the 17-stage `OrderStatus` lifecycle UI in the admin.

## EMI² Affordability Widget — Razorpay-side enablement (widget code DONE + verified rendering, 2026-08-25)

The widget is integrated and verified on /checkout (see `07-completed-work.md`): script loads, init runs, correct public test key, amount provably dynamic (₹95,000 / ₹5,67,000 paise), API returns 200 `enabled:true` with EMI/Cardless-EMI/PayLater/Offer entities, iframe renders real content (pixel-verified). A local integration bug (container hidden during render → 0-width iframe) was fixed the same day. What shows up inside it is controlled entirely by the Razorpay Dashboard:

1. ~~**Enable the widget**~~ — user confirmed *Widget Live* enabled in Dashboard (2026-08-25); verified working end-to-end.
2. **Configure plans/offers**: "Payment Offers" / "Affordable Payment Options" still show Enable Now — these toggles decide which of the already-flowing entities surface to customers; each has minimum order limits — small totals (e.g. ₹950 test order) legitimately show fewer/no options.
3. **Test vs live keys**: preview with Test keys (`rzp_test_…`), then swap Live keys in env for go-live.
4. Optional on-demand features (email affordability-widget@razorpay.com to enable): `checkout_callback` ("Buy Now" from widget auto-selects the instrument in Standard Checkout — integration steps already documented in the official standard-integration page; wire it into `launchRazorpayPayment` when granted) and eligibility check (phone+OTP).
5. Product-checkout widget path stays hidden until products carry real shipping config (seed demo items lack weight/dims → no Delhivery quote → total null → widget hidden).

## Known deferred shortcuts

- `Track` cache is written by app code on order events; if order volume grows, backfill via DB triggers instead.
- Guest carts are never garbage-collected; a cleanup job may be needed when volume justifies it.