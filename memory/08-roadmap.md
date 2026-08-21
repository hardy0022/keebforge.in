# 08 — Roadmap & Pending Work

Ordered roughly by dependency. Items marked BLOCKED need external input.

## Next up: Customer shop & checkout (Phases 3+4 of the product system)

Admin management (Phase 1+2) is done; the customer-facing side remains:

- **Phase 3 — Shop:** variant picking on `/product/[slug]`, brand shop pages (`/shop/brand/[slug]`), wishlist, review submission (post-order, `Review.orderId` unique, moderation gate), richer product detail (tabs, recommendations).
- **Phase 4 — Checkout:** real `/checkout` flow — addresses, coupon, order creation (snapshots per D-006) with `OrderItem` discount/tax, **inventory reservation** (`reservedQuantity` on product/variant) and release-on-cancel/refund, Razorpay payment + webhook verification, `OrderTimeline`/`Tracking` cache writes, transactional email (Resend).
- Cart completion: merge guest cart into profile cart on sign-in.

## Cloudinary media (deps already installed)

**BLOCKED on real credentials.** `.env` lacks `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. The gated `src/lib/cloudinary.ts` + `/api/admin/upload` route already exist and return 501 without them. Once present:

1. Set creds; wire the upload URL into `ProductForm` / `CategoryForm` / `BrandForm` image fields.
2. Prisma: extend `ProductImage` (+`cloudinaryPublicId`, `width`, `height`, `updatedAt`) and new `WorkImage` model (D-012) replacing `WorkProject.images` JSON.
3. Migrate `/work` + product images off local `/images/work/*` (only assets the app uses — no mass upload).
4. `next.config.ts`: Cloudinary `remotePatterns` for `next/image`.

## Dash ownership verification

**BLOCKED on a Vercel domain-level redirect, not on code.** `https://keebforge.in/api/auth` 308-redirects to www (set in the Vercel dashboard Domains settings); the repo has no redirect logic for this. Unblock by (in order):

1. Vercel → Project → Settings → Domains: set `keebforge.in` as the serving (primary) domain with **no "Redirect to www"** (point www → keebforge.in if you want www canonicalized).
2. Vercel → Settings → Environment Variables → **Production**: `BETTER_AUTH_URL=https://keebforge.in`, `NEXT_PUBLIC_APP_URL=https://keebforge.in`.
3. Redeploy (required — `NEXT_PUBLIC_*` is inlined at build).
4. Register `https://keebforge.in/api/auth/callback/google` and `.../callback/discord` in Google Cloud Console + Discord dev portal.

Then verify: `curl -I https://keebforge.in/api/auth/dash/validate` → **401 (not 308)**; re-run the dash connect check; test sign-up/sign-in/sign-out, `/api/auth/me`, Google OAuth, and admin login. Do **not** claim "Dash verified" until that's green in production.

## Accounts (remaining auth surface)

- `/account` (Profile + addresses) using Better Auth + `getCurrentAuth`; `/login` sign-up toggle already ships.

## Review & tracking (remaining Phase 7 items)

- Post-order review submission UI (model + moderation gate already in place).
- Warranty records and the 17-stage `OrderStatus` lifecycle UI in the admin.

## Known deferred shortcuts

- `Track` cache is written by app code on order events; if order volume grows, backfill via DB triggers instead.
- Guest carts are never garbage-collected; a cleanup job may be needed when volume justifies it.
- Dev machines: a root-owned `next-server` (PID 5872, v16.2.6) sits on port 3111 — needs `sudo kill 5872`.