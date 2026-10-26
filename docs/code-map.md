# KeebForge Code Map

Authoritative orientation for the current repository. Last reviewed: **2026-10-26**.

Use this document to find where a feature lives, what depends on it, and what
must not be changed casually. For deployment verification and migration history,
follow the links in [docs/README.md](./README.md).

## 1. Project Overview

KeebForge is a production storefront and workshop platform for mechanical
keyboards, peripherals, custom builds, modifications, and repairs.

- **Storefront:** catalog, categories, product configuration, cart, coupons,
  guest checkout, Razorpay payment, order tracking, reviews.
- **Workshop:** mods/service configurator, repair intake with photo uploads,
  custom-work requests, pickup or customer-shipped service orders.
- **Operations:** admin dashboard, orders, payments/refunds, Delhivery
  shipments and pickups, inventory, catalog, coupons, reviews, work portfolio,
  notification outbox, site settings.
- **Platform:** Next.js App Router, React Server Components, server actions,
  route handlers, Prisma/PostgreSQL, Better Auth, Vercel Cron.

Current baseline: Next.js `16.3.1`, React `19.2.8`, Prisma `6.19.x`, 43 Prisma
models, 23 enums, 48 repository migrations, 23 API route files, 65 page routes,
and 35 `src/lib` test files.

## 2. Repository Structure

```text
.
├── docs/                  Architecture, production runbooks, email templates, this map
├── prisma/                Schema + 48 forward-only migration directories
├── public/                Served static assets and generated architecture page
├── scripts/               Architecture generator, guarded DB tooling, E2E harnesses, email check
├── src/
│   ├── app/               Pages, layouts, API route handlers, server actions
│   ├── components/        Client/server UI grouped by domain
│   ├── lib/               Business logic, integrations, guards, pure helpers, tests
│   ├── styles/            Global CSS
│   └── proxy.ts           Next.js request proxy: admin kill switch, redirects, maintenance
├── .env.example           Tracked environment template (names, no real secrets)
├── .env.e2e.local.example Scratch DB template (names, loopback-only example values)
├── next.config.ts         Redirects, image loader, body limits, headers, tracing excludes
├── package.json           Scripts and dependency versions
├── vercel.json            Region `bom1` + paid-notification reconciliation cron
└── README.md              Project entry point
```

Ignored local state includes `.env*` (except the templates), `.next/`, `node_modules/`,
coverage, `.vercel/`, `deploy-checklist.md`, `opencode.json`, `.opencode/`, and
archived audit copies under `docs/MD-FILES/`.

## 3. Application Architecture

- **Rendering:** App Router server components for catalog, account, admin, and
  order views. Client components handle interactive configuration, cart
  add/remove, review composition, charts, and payment launch.
- **Mutations:** Server actions in `src/app/actions/*` and
  `src/app/admin/actions/*`; JSON/API flows in `src/app/api/**/route.ts`.
  Sensitive actions re-check auth, permissions, ownership, price, stock, and
  Preview policy server-side.
- **Database:** Prisma singleton in `src/lib/db/prisma.ts`, guarded by the
  Preview database-target check before client construction.
- **Auth:** Better Auth in `src/lib/auth/better-auth.ts`; session/profile
  resolution in `src/lib/auth/session.ts`; admin authorization in
  `src/lib/auth/admin.ts`.
- **Request gate:** `src/proxy.ts` handles the admin panel enable switch,
  case/legacy redirects, auth-error sanitization, and production maintenance
  mode. It is not the authorization boundary.
- **Caching:** tag-based server cache helpers in `src/lib/caching/`; production
  revalidation from Preview/local through `POST /api/revalidate`.
- **External services:** Razorpay, Delhivery, Resend, Cloudinary, Supabase
  (realtime for tracking), Vercel Analytics/Speed Insights.
- **Deployment modes:** `VERCEL_ENV=production` is normal. `preview` fails
  closed for database access, checkout, admin, and cron unless explicitly
  isolated. Local/self-hosted (`VERCEL_ENV` unset) follows local behavior.

## 4. Route Map

### 4.1 Storefront and public pages

| Route | Access | Purpose |
|---|---|---|
| `/` | Public | Home: hero, featured build, services, reviews, CTA |
| `/shop` | Public | Main shop/catalog |
| `/shop/products` | Public | All-products catalog |
| `/shop/clearance` | Public | Clearance/condition products |
| `/shop/custom` | Public | Custom-build products |
| `/shop/[category]` | Public | Category catalog |
| `/product/[slug]` | Public | Product detail, options, add-on, colors, reviews |
| `/mods` | Public | Keyboard/mouse services and mods configurator |
| `/workshop` | Public | Repair intake form |
| `/work` | Public | Completed-work portfolio |
| `/work/[slug]` | Public | Work project detail |
| `/track-order` | Public | Order/shipment tracking lookup |
| `/about` | Public | About page |
| `/contact` | Public | Contact/inquiry form |
| `/faq` | Public | FAQ |
| `/privacy-policy` | Public | Privacy policy |
| `/returns-refunds` | Public | Returns/refunds policy |
| `/shipping-information` | Public | Shipping information |
| `/terms` | Public | Terms |
| `/maintenance` | Public | Maintenance landing; bypasses maintenance redirect |
| `/unauthorized` | Public | Access-denied landing |

`next.config.ts` permanently or temporarily redirects legacy paths including
`/services`, `/repair`, `/keyboard-repair`, `/mouse-repair`, `/pricing`,
`/order`, `/Terms&Conditions`, old service slugs, `/login`, `/register`,
`/forgot-password`, `/cart`, `/checkout`, `/profile`, and
`/account/addresses`.

### 4.2 Commerce, auth, account, and review pages

| Route | Access | Purpose |
|---|---|---|
| `/shop/cart` | Public/guest | Cart and service-job review |
| `/shop/checkout` | Public/guest | Product checkout; server actions enforce price, stock, shipping, coupon, Preview policy |
| `/mods/checkout` | Public/guest | Service checkout with pickup/shipping choice |
| `/order/success/[orderNumber]` | Signed-in owner or guest capability cookie | Payment/order success; no plain order-number disclosure |
| `/order/success/[orderNumber]/exchange` | Same order capability | Payment retry/exchange path |
| `/auth/login` | Public | Sign in |
| `/auth/register` | Public | Registration |
| `/auth/forgot-password` | Public | Password-reset request |
| `/auth/callback` | Public | OAuth callback |
| `/auth/error` | Public | Sanitized auth error display |
| `/reset-password` | Public with reset token | Set a new password |
| `/write-review` | Signed-in customer | Review chooser |
| `/write-review/[slug]` | Signed-in customer | Product review composer |
| `/write-review/edit` | Signed-in customer | Edit own review |
| `/write-review/[slug]/edit` | Signed-in customer | Edit own product review |
| `/account` | Signed-in customer | Redirects to `/account/profile` |
| `/account/orders` | Signed-in customer | Order history |
| `/account/profile` | Signed-in customer | Profile, addresses, reviews |
| `/account/settings` | Signed-in customer | Account settings/newsletter |

### 4.3 Admin pages

All routes require the admin panel to be enabled and pass
`requireAdminContext()` in `src/app/admin/layout.tsx`; each page then enforces
its permission. `STAFF`/`DEVELOPER` permissions are limited by
`src/lib/auth/roles.ts`.

| Route | Minimum permission |
|---|---|
| `/admin` | Admin context (dashboard) |
| `/admin/orders` | `order:view` |
| `/admin/orders/completed` | `order:view` |
| `/admin/orders/[orderNumber]` | `order:view` |
| `/admin/payments` | `order:view` |
| `/admin/notifications` | `order:view` |
| `/admin/shipments` | `order:view` |
| `/admin/products` | `product:view` |
| `/admin/products/[id]` | `product:view` |
| `/admin/products/new` | `product:create` |
| `/admin/products/[id]/edit` | `product:update` |
| `/admin/products/inventory` | `product:update` |
| `/admin/products/import` | `product:create` |
| `/admin/products/categories` | `product:create` |
| `/admin/mods` | `mod:view` |
| `/admin/customers` | `customer:view` |
| `/admin/coupons` | `coupon:view` |
| `/admin/reviews` | `review:view` |
| `/admin/analytics` | `order:view` |
| `/admin/settings` | `setting:view` |
| `/admin/settings/categories` | `setting:view` |
| `/admin/settings/brands` | `setting:view` |
| `/admin/work` | `setting:update` |
| `/admin/work/new` | `setting:update` |
| `/admin/work/[id]` | `setting:update` |

### 4.4 API route handlers

| Route | Methods | Access/notes |
|---|---|---|
| `/api/auth/[...all]` | Better Auth | Auth provider endpoints |
| `/api/auth/check-username` | `GET` | Username availability |
| `/api/auth/me` | `GET` | Current session summary |
| `/api/account/profile` | `GET`, `PATCH` | Signed-in profile; rate limited on mutation |
| `/api/account/addresses` | `GET`, `POST` | Signed-in address book; max 20 |
| `/api/account/addresses/[id]` | `GET`, `PATCH`, `DELETE` | Own address |
| `/api/account/addresses/[id]/default` | `POST` | Set own default address |
| `/api/cart` | `GET`, `DELETE` | Resolve cart / clear cart |
| `/api/cart/count` | `GET` | Header cart badge count |
| `/api/cart/service` | `DELETE` | Remove service job from cart |
| `/api/coupons/validate` | `POST` | Public coupon preview; authoritative re-check at order creation |
| `/api/payments/create-order` | `POST` | Create local order + Razorpay order; rate limited |
| `/api/payments/verify` | `POST` | Verify signed checkout result; idempotent settlement |
| `/api/payments/pay-inline` | `POST` | Inline/retry payment for an authorized order capability |
| `/api/payments/webhook` | `POST` | Razorpay webhook; signature + idempotent settlement/refunds |
| `/api/payments/exchange` | `POST` | Resolve payment-retry exchange capability |
| `/api/services/create-order` | `POST` | Mods/repair service order; package validation + rate limit |
| `/api/shipping/calculate` | `POST` | Product shipping quote; rate limited |
| `/api/shipping/service-quote` | `POST` | Service pickup/return leg quote; package validation |
| `/api/uploads` | `POST`, `DELETE` | Cloudinary upload/delete; validation + auth policy |
| `/api/settings/public` | `GET` | Public site settings |
| `/api/cron/reconcile-paid-notifications` | `GET` | Bearer `CRON_SECRET`; paid-order outbox backfill |
| `/api/revalidate` | `POST` | Bearer `REVALIDATE_SECRET`; allow-listed cache tags/paths |

### 4.5 Server actions

| File | Exported actions |
|---|---|
| `src/app/actions/cart.ts` | `addToCart`, `updateCartItem`, `removeCartItem` |
| `src/app/actions/inquiry.ts` | `sendInquiry` |
| `src/app/actions/repair-request.ts` | `submitRepairRequest` |
| `src/app/actions/review.ts` | `submitReview`, `deleteOwnReview` |
| `src/app/actions/track-order.ts` | `fetchShipmentScans`, `trackOrder` |
| `src/app/account/settings/actions.ts` | `saveNewsletterOpt` |
| `src/app/admin/actions/catalog.ts` | Product, category, brand, variant, inventory, import, color actions |
| `src/app/admin/actions/coupons.ts` | `saveCoupon`, `toggleCoupon`, `deleteCoupon` |
| `src/app/admin/actions/mods.ts` | `updateModPrice` |
| `src/app/admin/actions/notifications.ts` | Report, queue, review, resend, retry paid notifications |
| `src/app/admin/actions/orders.ts` | Status, timeline, shipping, notes, amounts, address, shipment, pickup, manual payment, delete |
| `src/app/admin/actions/reviews.ts` | `moderateReview`, `deleteReviewAsAdmin` |
| `src/app/admin/actions/settings.ts` | Maintenance, development notice, email notification toggles |
| `src/app/admin/actions/work.ts` | `saveWork`, `toggleWork`, `moveWork`, `deleteWork` |

Admin actions must keep their own `requirePermission(...)` check even when the
rendering page is already guarded.

## 5. Customer Features

- **Home:** server-rendered marketing sections plus reviews and analytics.
- **Shop:** filters, categories, clearance/custom sections, product cards,
  stock/availability display, option/color selection, add-on selection.
- **Product detail:** gallery, variants, option groups, colors, add-on,
  shipping/warranty copy, related products, review summary.
- **Product configurator:** server-resolved option pricing snapshots; the
  client cannot invent prices.
- **Cart:** guest token or profile cart, merged on login, mixed product and
  single service job, server-side quantity/stock checks.
- **Checkout:** address, coupon, server shipping quote, Razorpay checkout,
  signature verification, success capability page.
- **Order tracking:** public order lookup with safe tracking/Delhivery scans;
  `/track/[orderNumber]` is excluded from the proxy matcher.
- **Reviews:** verified purchase/customer policy, image limits, edit/delete own
  review, admin moderation.
- **Workshop:** repair intake with photos, device/issue fields, shipping
  preference; results in a `REPAIR` order.
- **Mods:** service configuration, price/quantity validation, pickup vs
  customer-shipping, return leg, optional reverse pickup.
- **Account:** profile, address book, order history, newsletter setting.
- **Contact:** inquiry form and internal notification email.

## 6. Admin Features

- **Dashboard:** revenue/order/payment/repair/product/customer stats, revenue
  series, repair pipeline, recent activity.
- **Orders:** filters, search, pagination, detail, status timeline, internal and
  customer-visible notes, amounts, address, manual payments, deletion guard.
- **Payments/refunds:** capture state, refund accounting and evidence; order
  deletion is blocked when refund evidence would be destroyed.
- **Shipping:** Delhivery shipment creation/update/cancel, pickup booking,
  warehouse pickup, tracking state.
- **Notifications:** paid-confirmation outbox diagnostics, queue/review/resend/
  retry, missing-notification report.
- **Catalog:** products, variants, inventory adjustments, categories, brands,
  import, images, option groups, color options, add-ons.
- **Coupons:** create/edit, activate/deactivate, delete, usage tracking.
- **Customers:** aggregated customer/order view.
- **Reviews:** moderation and deletion.
- **Mods:** service price management.
- **Work:** portfolio project create/edit/reorder/visibility/delete.
- **Settings:** maintenance mode, development notice, email notification
  toggles, categories/brands.
- **Analytics:** order/revenue views.

## 7. Authentication

Key files:

- `src/lib/auth/better-auth.ts` — Better Auth configuration, Prisma adapter,
  email/password, Google/Discord providers, verification email, reset email.
- `src/lib/auth/session.ts` — `getCurrentAuth`, `requireUser`, `requireAdmin`,
  profile lookup.
- `src/lib/auth/profile.ts` — profile creation/upsert and user-profile linkage.
- `src/lib/auth/admin.ts` — admin context, staff organization check,
  `requireAdminContext`, `requirePermission`.
- `src/lib/auth/roles.ts` — permission matrix and admin-nav visibility.
- `src/lib/auth/auth-error.ts` — allow-listed upstream auth errors.
- `src/lib/auth/register-error.ts`, `resend-verification.ts` — safe user-facing
  auth errors/cooldowns.
- `src/lib/auth/account-linking.test.ts` — account linking behavior.
- `src/lib/orders/claim-guest-orders.ts` — claim guest orders after sign-in,
  capability-aware.

Rules:

- `ADMIN` has full access. `STAFF`/`DEVELOPER` use the explicit
  `STAFF_PERMISSIONS` matrix. `CUSTOMER` has no admin access.
- A member of the designated `developer` organization with role `owner` or
  `developer` is treated as admin; membership in any other user-created
  organization is not elevation.
- The admin layout guard is mandatory, but every sensitive action also calls
  `requirePermission`.
- `src/proxy.ts` can hide `/admin` with a 404, but that is a routing/kill switch,
  not authorization.
- Preview deployments return no admin context unless Preview operations are
  explicitly isolated and enabled.
- Auth error raw provider text must not reach rendered pages.

## 8. Database / Prisma

Schema: `prisma/schema.prisma`. Client: generated by `npm run db:generate`.
Migrations: `prisma/migrations/` (48 directories). Migration ledger facts live in
[`docs/production/migration-history.md`](./production/migration-history.md);
do not edit or rewrite a historical migration.

Model groups:

- **Auth/identity:** `User`, `Session`, `Account`, `Verification`,
  `Organization`, `Member`, `Invitation`, `Profile`, `CustomerProfile`,
  `Address`.
- **Catalog:** `Category`, `Brand`, `Product`, `ProductVariant`,
  `ProductOptionGroup`, `ProductOption`, `ProductImage`,
  `ProductColorOption`, `InventoryMovement`, `Media`.
- **Workshop:** `Mods`, `Service`.
- **Commerce:** `Order`, `OrderAddress`, `OrderItem`, `OrderService`,
  `OrderRepair`, `Payment`, `Refund`, `Shipment`, `OrderTimeline`,
  `OrderMessage`, `WarrantyRecord`, `Tracking`, `OrderNotification`.
- **Cart:** `Cart`, `CartItem`, `CartServiceItem`.
- **Marketing/portfolio:** `Review`, `Coupon`, `CouponUsage`, `WorkProject`,
  `SiteSetting`.

Critical schema guarantees:

- `OrderNotification` has `@@unique([orderId, type])`; this is the
  at-most-one automatic paid-email claim.
- `Refund.razorpayRefundId` is unique; refund processing must use it as the
  idempotency key.
- `Payment.refundedAmount` is cumulative per payment and clamped to `amount`.
- `Tracking` is a public-safe, denormalized projection with no PII.
- `Review` prevents duplicate profile/product reviews.
- `ProductColorOption.group` uses `ColorOptionGroup` (`BASE`/`SECONDARY`).
- `Cart` supports either one profile cart or one guest-token cart.
- Order deletion is logical (`Order.isDeleted`) and subject to refund-evidence
  rules.

Do not run `prisma migrate dev`, `prisma migrate reset`, or direct SQL against
production. `npm run db:deploy` refuses the production path on `main`; use the
documented guarded operator process only.

## 9. Payments

Key files:

- `src/lib/payments/payment-status.ts` — payment-state normalization and
  amount clamping.
- `src/lib/payments/razorpay-signature.ts` — signature verification.
- `src/lib/payments/settle-order.ts` — idempotent order/payment settlement.
- `src/lib/payments/refund-accounting.ts` — refund planning/clamping.
- `src/lib/payments/webhook-core.ts` — webhook event handling.
- `src/lib/payments/pay-inline-core.ts` — retry/inline payment.
- `src/lib/payments/order-capability.ts` — signed/opaque order access cookie.
- `src/lib/payments/order-access.ts` — capability cookie lifecycle.
- `src/lib/payments/razorpay-pay.ts`, `razorpay-customer.ts` — Razorpay helpers.
- `src/lib/payments/rate-limit.ts` — in-memory rate limiting.
- `src/lib/payments/billing-details.ts`, `exchange-href.ts` — checkout data.
- Routes: `src/app/api/payments/*`.

Flow:

1. Server calculates authoritative cart totals, discount, shipping, and tax.
2. Creates local order and Razorpay order.
3. Browser completes Razorpay checkout.
4. `/api/payments/verify` verifies the signature and settles idempotently.
5. `/api/payments/webhook` independently verifies and settles refunds/payments.
6. Settlement updates payment/order state, tracking projection, timeline, and
   queues a paid-confirmation notification outside the money transaction.

Never trust client amounts, payment status, signature, or order ownership.
Payment/refund evidence must be preserved.

## 10. Shipping

Key files:

- `src/lib/shipping/delhivery.ts` — Delhivery API client, rate quotes, shipment
  creation/update/cancel, pickup, tracking, errors, and inline self-checks.
- `src/lib/shipping/pickup-config.ts` — pickup and return-address env resolution.
- `src/lib/shipping/pickup-slots.ts` — pickup slot handling.
- `src/lib/shipping/service-legs.test.ts` — pickup/return leg rules.
- `src/lib/shipping/shipping-estimate.ts` — service-leg derivation.
- `src/lib/shipping/package-limits.ts` — max side 100 cm, combined 250 cm,
  weight 30 kg.
- `src/lib/shipping/track-phases.ts` — customer phase labels and Delhivery scan
  mapping.
- `src/lib/orders/shipping-choice.ts` — reads stored pickup/ship choice per
  order type.

Rules:

- Product shipping is quoted by Delhivery, not estimated in the client.
- Service orders have a return leg always, plus a reverse-pickup leg when the
  customer chooses pickup. `ss=RTO` is not a return leg.
- Missing provider quotes hide/refuse the amount rather than charge zero.
- Package validation is shared by UI and server.
- Live mods quotes require Delhivery configuration; do not fabricate fallback
  rates.
- Preview deployments must not book production shipments.

## 11. Email / Resend

Key files:

- `src/lib/email/templates.ts` — six Resend template IDs and payload builders.
- `src/lib/email/outbound.ts` — server-only Resend send wrapper.
- `src/lib/email/outbound-policy.ts` — redirect/suppress recipient policy.
- `src/lib/email/email-policy.ts` — per-notification-type enablement.
- `src/lib/email/email-settings.ts` — admin email settings.
- `src/lib/auth/send-verification-email.ts` — verification mail.
- `src/lib/auth/resend-verification.ts` — cooldown/retry.
- `src/lib/notifications/*` — paid-confirmation outbox, diagnostics, reconcile.
- `scripts/email/resend-shop-order-paid.ts` — template smoke/test helper.

Templates are **remote Resend templates**, not inline HTML. All six IDs are
required for their respective emails:

- `RESEND_TEMPLATE_PASSWORD_RESET`
- `RESEND_TEMPLATE_EMAIL_VERIFICATION`
- `RESEND_TEMPLATE_CONTACT_INQUIRY`
- `RESEND_TEMPLATE_REPAIR_REQUEST`
- `RESEND_TEMPLATE_SHOP_ORDER_PAID`
- `RESEND_TEMPLATE_MODS_ORDER_PAID`

If an ID is missing, that send path must fail/skip explicitly. Do not add an
inline-HTML fallback. Delivered variables must be strings; list content is
pre-rendered and escaped into `*Html` variables.

`EMAIL_SEND_DISABLED` and `EMAIL_TEST_RECIPIENT` are safety switches: suppression
wins, invalid overrides skip, and production must leave both unset.

## 12. Product System

Key files:

- `src/lib/catalog/data.ts` — product/catalog reads, details, related items,
  gallery/options.
- `src/lib/catalog/shop.ts` — shop section/filter rules and card features.
- `src/lib/catalog/product-options.ts` — option groups, selection mode, canonical
  config key, pricing.
- `src/lib/catalog/product-addon.ts` — single add-on eligibility and price.
- `src/lib/catalog/product-labels.ts` — display labels.
- `src/lib/catalog/fix-corne-choc-seo.ts` — targeted catalog maintenance helper.
- `src/lib/admin/catalog.ts` — admin catalog reads/serialization.
- `src/app/admin/actions/catalog.ts` — catalog mutations.
- `src/components/shop/*`, `src/components/admin/products/*` — UI.

Product rules:

- Active/status visibility must be enforced server-side.
- The product base price plus selected option add-ons, color adjustments, and
  single add-on form the unit price.
- Cart/order snapshots preserve display values even if the catalog changes.
- `ProductType` controls standard/configurable/custom behavior.
- Stock/reservations are checked on add-to-cart and order creation.
- Images must use the Cloudinary custom loader for uploaded assets and
  pre-optimized public assets for static files.

## 13. Product Options

- `ProductOptionGroup.selectionMode` is `SINGLE` (radio; exactly one when
  required) or `MULTIPLE` (checkbox; zero or more, or at least one when
  required).
- Selection mode is a group property, never inferred from product type/name.
- Option add-ons are integer paise; pricing is computed server-side.
- Canonical option identity is built with `configKey` and stored in cart/order
  snapshots. Never trust client-supplied option prices or labels.
- Tests: `src/lib/catalog/product-options.test.ts`.

## 14. Product Colors

- `ProductColorOption` belongs to a product with group `BASE` or `SECONDARY`.
- Each option has a color name/code, optional image, price adjustment in paise,
  enabled flag, and sort order.
- The base color and optional secondary color are separate selections.
- `Product.secondaryColorHeading` controls the secondary selector heading.
- Cart/order snapshots store color IDs plus name/code/price and secondary
  heading/name/code/price so historical orders remain readable.
- Tests: `src/lib/catalog/product-addon.test.ts` and catalog/admin checks.

## 15. Add-ons

- A product may expose one optional add-on via `addonEnabled`, `addonTitle`,
  `addonDescription`, and `addonPrice` (paise).
- `resolveProductAddon`-style logic in `src/lib/catalog/product-addon.ts`
  determines eligibility, price, and snapshot fields.
- Cart and order items store `addonSelected`, title, description, price, and
  snapshot values.
- Negative/invalid add-on prices fail closed (free or rejected, not negative).
- Tests: `src/lib/catalog/product-addon.test.ts`.

## 16. Cart

Key files:

- `src/lib/cart.ts` — owner resolution, guest-token cookie, line identity,
  guest-to-profile merge, availability, quantities.
- `src/app/actions/cart.ts` — add/update/remove actions.
- `src/app/api/cart*` — read/count/delete API.
- `src/components/cart/CartView.tsx` — cart UI.
- `src/components/shop/AddToCart.tsx`, `CardAddToCart.tsx`,
  `ProductConfigurator.tsx` — add-to-cart entry points.
- `prisma` models `Cart`, `CartItem`, `CartServiceItem`.

Rules:

- One cart per profile or guest token.
- Guest cart is claimed atomically on login and merged; identical non-CUSTOM
  lines combine up to `MAX_CART_QUANTITY`; different options/colors/add-ons stay
  separate; CUSTOM/made-to-order lines stay quantity 1.
- At most one service job per cart; adding/replacing replaces the prior service
  config.
- Limits: 50 quantity per line, 50 lines, 20 addresses.
- Never trust client line totals; recompute from current DB data at checkout.

## 17. Orders

Key files:

- `src/lib/orders/index.ts` — order status labels/formatting and shared order
  helpers.
- `src/lib/orders/tracking.ts` — tracking projection/read logic.
- `src/lib/orders/variant-info.ts` — product variant/option display snapshots.
- `src/lib/orders/claim-guest-orders.ts` — claim guest orders after sign-in.
- `src/lib/orders/shipping-choice.ts` — pickup vs ship choice.
- `src/app/order/success/[orderNumber]/*` — capability-protected success pages.
- `src/app/api/payments/*`, `src/app/api/services/create-order/route.ts`,
  `src/app/api/shipping/*` — order/payment/shipping creation.
- `src/app/admin/actions/orders.ts`, `src/app/admin/orders/*` — operations.
- `src/lib/admin/order-filters.ts` — admin order filtering (new/tested).

Rules:

- Order number alone is not an authorization credential.
- Guest success access uses the order capability cookie/token.
- `Order.type` is `PRODUCT`, `SERVICE`, or `REPAIR`.
- Order/payment/refund/shipment/timeline/link records are the history; avoid
  destructive updates.
- Logical deletion (`isDeleted`) is guarded; orders with refund evidence cannot
  be deleted.
- Tracking is a public-safe projection; do not add PII.

## 18. Notifications

Key files:

- `src/lib/notifications/paid-confirmation.ts` — paid-confirmation payload and
  safe rendering.
- `src/lib/notifications/send-paid-confirmation.ts` — claim/send/update outbox.
- `src/lib/notifications/reconcile-cron.ts` — paid-order reconciliation.
- `src/lib/notifications/resend-diagnostics.ts` — sanitized failure details.
- `src/app/api/cron/reconcile-paid-notifications/route.ts` — cron entry.
- `src/app/admin/actions/notifications.ts`, admin notifications page — ops.
- `src/lib/email/email-policy.ts` — notification type enable/disable.

Rules:

- Automatic sends are at most one per `(orderId, type)` via the unique outbox
  row and conditional status claim.
- Money settlement and email delivery are intentionally separate transactions.
- `SUPPRESSED` is a terminal state when the admin disables that type.
- `PAID_NOTIFICATION_RECONCILE_SINCE` protects historical orders; limit is
  clamped to 100.
- Cron fails closed without `CRON_SECRET`.
- Never log message bodies, addresses, payloads, or secrets.

## 19. Security

- **Auth boundary:** Better Auth session + server-side profile/role checks.
  Advertising/nav visibility is not authorization.
- **Admin gate:** `src/proxy.ts` kill switch + `src/app/admin/layout.tsx` guard +
  per-action `requirePermission`.
- **Preview isolation:** `src/lib/config/preview-guard.ts` and
  `src/lib/config/deployment.ts`; Preview DB/admin/checkout/cron fail closed
  unless explicitly isolated.
- **Payments:** Razorpay signature checks, idempotent settlement, amount
  clamping, refund idempotency, order capabilities.
- **Rate limits:** payment/order/shipping/auth/account/address endpoints.
- **Input validation:** Zod in `src/lib/validation/customer-input.ts`, shared
  limits in `src/lib/utils/limits.ts`, JSON body limits in
  `src/lib/http/read-json-body.ts`.
- **Uploads:** MIME/type/size/dimension checks in `src/lib/images/*`, max image
  and total-byte limits, Cloudinary public-ID handling.
- **Email:** outbound recipient policy and remote-template-only rendering.
- **Maintenance:** production-only setting, 30-second in-process cache, bypasses
  admin/auth/maintenance, proxies API/static exclusions.
- **Caching:** allow-listed tags/paths and bearer auth on `/api/revalidate`.
- **Secrets:** never print, commit, or expose env values; `.env*` is ignored
  except templates.

## 20. External Integrations

| Integration | Code | Purpose | Failure behavior |
|---|---|---|---|
| PostgreSQL/Supabase | `src/lib/db/prisma.ts`, `prisma/` | Primary DB | Fail request; Preview guard can refuse client init |
| Better Auth | `src/lib/auth/*` | Sessions, OAuth, email/password | Redirect to auth/error; sanitize upstream text |
| Razorpay | `src/lib/payments/*` | Orders, payment, refunds, webhook | Refuse unverified/late/duplicate settlement |
| Delhivery | `src/lib/shipping/*` | Rates, shipments, pickup, tracking | Typed errors; no fabricated rates |
| Resend | `src/lib/email/*`, notifications | Transactional email | Refuse on missing template/key; outbox diagnostic |
| Cloudinary | `src/lib/images/*`, `/api/uploads` | Product/review/inquiry media | Validation/refusal; deletion only on owned assets |
| Supabase Realtime | `src/lib/realtime/*` | Tracking notifications | Degrade to polling/tracking read |
| Vercel Analytics/Speed Insights | `src/components/Analytics.tsx` | Observability | Non-critical |
| Vercel Cron | `vercel.json`, cron route | Notification reconciliation | Fail closed on secret/config error |

## 21. Scripts

| Script | Purpose | Safety notes |
|---|---|---|
| `scripts/db/deploy.ts` | Prisma deploy wrapper | Production path refuses on `main`; do not bypass casually |
| `scripts/db/production-migration-path.ts` | Guarded operator migration path | Separate/transient; not a normal release step |
| `scripts/e2e/migrate-scratch.ts` | Scratch deploy/status/diff | Loopback-only; refuse non-local targets |
| `scripts/e2e/migrate-scratch-plan.ts` | Hostile-value test planner | No DB connection |
| `scripts/e2e/scratch-guard.ts` | Scratch DB target guard | Shared safety rules; pins migration count |
| `scripts/e2e/scratch-guard.test.ts` | Guard regression tests | Includes expected 48-migration tripwire |
| `scripts/e2e/dbcheck.ts` | Scratch schema/data checks | Scratch only |
| `scripts/e2e/auth-preflight.ts` | Scratch auth readiness | Scratch only |
| `scripts/e2e/local-env.ts` | E2E env loading | Local-only template handling |
| `scripts/e2e/e2e-server.ts` | Local E2E server | Loopback |
| `scripts/e2e/run-order-success-page.ts` | Order success-page E2E | Requires local server/scratch |
| `scripts/e2e/run-notification-outbox.ts` | Outbox integration harness | Scratch/loopback |
| `scripts/e2e/seed.ts` | Scratch seed | Refuses unsafe targets |
| `scripts/e2e/seed.mjs` | Guarded refusal shim | Intentional: does not seed |
| `scripts/e2e/scratch-auth.sql` | Scratch auth fixture SQL | Scratch only |
| `scripts/architecture/architecture-map.mjs` | Architecture generator | Writes docs HTML + `public/architecture.html` |
| `scripts/email/resend-shop-order-paid.ts` | Resend template check/send helper | Never print secrets |
| `scripts/email/resend-shop-order-paid.test.ts` | Template payload test | Offline |

## 22. Tests

Run individual checks from `package.json`; key groups:

- **Environment/preview/revalidate:** `check:environment`, `check:preview-guard`,
  `check:revalidate`.
- **Auth:** `check:auth` (guest claims, errors, linking, resend, registration).
- **Payments/webhook/refunds:** `check:webhook`, `check:payment-status`,
  `check:payment-signature`, `check:refund-accounting`,
  `check:payment-endpoints`, `check:order-refund-evidence`, `check:rate-limit`,
  `check:input-hardening`.
- **Orders/cart-adjacent:** `check:variant-info`, `check:shipping-choice`,
  `check:admin-orders`.
- **Catalog:** `check:product-options`, `check:product-addon`.
- **Shipping:** `check:shipping`, `check:shipping-legs`.
- **Email/notifications:** `check:outbound-policy`, `check:email-paths`,
  `check:email-settings`, `check:email-templates`,
  `check:resend-template`, `check:paid-confirmation`, `check:reconcile-cron`,
  `check:paid-triggers`.
- **DB safety:** `check:scratch-db`.
- **Aggregate security:** `check:security` (the full offline security suite).
- **E2E:** `e2e:seed`, `e2e:server`, `e2e:order-success-page`,
  `e2e:notification-outbox`.

`src/lib` contains 35 test files, including tests not individually exposed as npm
scripts (`customers.test.ts`, `account-linking.test.ts`,
`register-error.test.ts`, `email-settings.test.ts`, etc.). When changing shared
logic, run the closest check plus `npm run typecheck`.

## 23. Documentation

| Path | Role |
|---|---|
| `docs/README.md` | Documentation index/status |
| `docs/code-map.md` | This authoritative code/file/route/env map |
| `docs/architecture/authorization-and-rls.md` | Auth/RLS audit snapshot; runtime DB role unverified |
| `docs/architecture/keebforge.runtime.json` | Canonical architecture spec, pinned to revision `4f205dd...` |
| `docs/architecture/keebforge.runtime.html` | Generated architecture viewer |
| `public/architecture.html` | Public copy generated by the architecture script |
| `docs/architecture/keebforge.runtime.visual-check.{html,json}` | Visual-check evidence |
| `docs/architecture/*.visual-check.*.png` | Screenshot evidence (1440×900, 2048×1320; dark/light) |
| `docs/production/configuration-checklist.md` | Read-only production config verification |
| `docs/production/launch-test-matrix.md` | Launch verification matrix |
| `docs/production/migration-history.md` | Authoritative migration ledger/reconciliation |
| `docs/resend-templates.md` | Resend template variables/operations |

Generated architecture evidence is not a runtime asset. The JSON
`visual-check.json` contains a machine-specific absolute artifact path; do not
treat it as portable source. The architecture spec is a snapshot and may lag the
current tree; do not regenerate it as part of routine cleanup unless explicitly
requested.

## 24. Environment Variables

Never commit real values. `.env.example` is the baseline template. The list below
covers source-referenced and script-only variables; several optional runtime
variables are intentionally documented here even though the template does not
list them. "Secret" means the value must never be printed or exposed to clients.

| Variable(s) | Environment | Required | Secret | Purpose |
|---|---|---|---|---|
| `DATABASE_URL` | All | Yes | Yes | Pooled app database connection |
| `DIRECT_URL` | All | Yes | Yes | Prisma direct/migration connection |
| `NEXT_PUBLIC_APP_URL` | All | Yes | No | Canonical public URL |
| `NEXT_PUBLIC_SUPABASE_URL` | All | Yes | No | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Yes | No* | Supabase browser key (public by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Yes | Yes | Privileged Supabase access; never client-exposed |
| `BETTER_AUTH_SECRET` | All | Yes | Yes | Session/token signing |
| `BETTER_AUTH_URL` | All | Yes | No | Better Auth base URL |
| `BETTER_AUTH_API_KEY` | Server | Optional | Yes | Better Auth infra API key |
| `BETTER_AUTH_IDENTIFY_URL` | Server | Optional | No | Server identify endpoint |
| `NEXT_PUBLIC_BETTER_AUTH_IDENTIFY_URL` | Client | Optional | No | Client identify endpoint |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Server | Optional | Yes/No | Google OAuth (secret for secret half) |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Server | Optional | Yes/No | Discord OAuth |
| `CLOUDINARY_CLOUD_NAME` | Server | Yes | No | Cloudinary cloud |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Server | Yes | Yes | Cloudinary API credentials |
| `RESEND_API_KEY` | Server | Yes | Yes | Resend API |
| `EMAIL_FROM` | Server | Yes | No | Verified sender identity |
| `RESEND_TEMPLATE_PASSWORD_RESET` | Server | Yes for reset mail | No | Resend template ID |
| `RESEND_TEMPLATE_EMAIL_VERIFICATION` | Server | Yes for verification mail | No | Resend template ID |
| `RESEND_TEMPLATE_CONTACT_INQUIRY` | Server | Yes for inquiries | No | Resend template ID |
| `RESEND_TEMPLATE_REPAIR_REQUEST` | Server | Yes for repair mail | No | Resend template ID |
| `RESEND_TEMPLATE_SHOP_ORDER_PAID` | Server | Yes for shop paid mail | No | Resend template ID |
| `RESEND_TEMPLATE_MODS_ORDER_PAID` | Server | Yes for mods paid mail | No | Resend template ID |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Server | Yes | Yes | Razorpay API |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Client | Yes | No | Razorpay checkout key |
| `RAZORPAY_WEBHOOK_SECRET` | Server | Yes | Yes | Webhook signature verification |
| `DELHIVERY_API_URL` | Server | Yes for shipping | No | Delhivery API base |
| `DELHIVERY_API_TOKEN` | Server | Yes for shipping | Yes | Delhivery auth token |
| `DELHIVERY_ORIGIN_PINCODE` | Server | Yes for shipping | No | Default warehouse pincode |
| `DELHIVERY_DEFAULT_MODE` / `DELHIVERY_MODES` | Server | Yes for shipping | No | Default/allowed service speeds |
| `DELHIVERY_SURFACE_DAYS` / `DELHIVERY_EXPRESS_DAYS` | Server | Optional | No | ETA overrides (code-supported, not in template) |
| `DELHIVERY_PICKUP_NAME` | Server | Yes for pickup | No | Pickup contact name |
| `DELHIVERY_PICKUP_ADDRESS` | Server | Yes for pickup | No | Pickup street address |
| `DELHIVERY_PICKUP_CITY` | Server | Yes for pickup | No | Pickup city |
| `DELHIVERY_PICKUP_PIN` | Server | Yes for pickup | No | Pickup pincode (falls back to origin) |
| `DELHIVERY_PICKUP_STATE` | Server | Yes for pickup | No | Pickup state |
| `DELHIVERY_PICKUP_COUNTRY` | Server | Optional | No | Pickup country |
| `DELHIVERY_PICKUP_PHONE` | Server | Yes for pickup | Yes | Pickup phone |
| `DELHIVERY_PICKUP_EMAIL` | Server | Yes for pickup | No | Pickup email |
| `DELHIVERY_PICKUP_ACCOUNT_NAME` | Server | Optional | No | Pickup account name |
| `DELHIVERY_PICKUP_RETURN_ADDRESS` | Server | Yes for returns | No | Return street address |
| `DELHIVERY_PICKUP_RETURN_PIN` | Server | Yes for returns | No | Return pincode |
| `DELHIVERY_PICKUP_RETURN_CITY` | Server | Yes for returns | No | Return city |
| `DELHIVERY_PICKUP_RETURN_STATE` | Server | Yes for returns | No | Return state |
| `DELHIVERY_PICKUP_RETURN_COUNTRY` | Server | Optional | No | Return country |
| `FREE_SHIPPING_THRESHOLD` | Server | Optional | No | Store-wide free-shipping threshold in paise; supported in code, not template |
| `NEXT_PUBLIC_GTM_ID` | Client | Optional | No | Google Tag Manager |
| `CRON_SECRET` | Production | Yes for cron | Yes | Bearer auth for notification reconciliation |
| `PAID_NOTIFICATION_RECONCILE_SINCE` | Production | Yes for cron | No | ISO lower bound for eligible paid orders |
| `PAID_NOTIFICATION_RECONCILE_LIMIT` | Production | Optional | No | Per-run cap; clamped to 100 |
| `REVALIDATE_SECRET` | Production | Yes for cross-env purge | Yes | Bearer auth for `/api/revalidate` |
| `REVALIDATE_PRODUCTION_URL` | Local/Preview | Optional | No | Forward cache purge to production |
| `EMAIL_SEND_DISABLED` | Server | Optional | No | Suppress all outbound mail |
| `EMAIL_TEST_RECIPIENT` | Server | Optional | No | Redirect all outbound mail to one address |
| `ADMIN_PANEL_ENABLED` | Server | Optional | No | Master admin-panel switch |
| `ADMIN_PANEL_PRODUCTION_ENABLED` | Production | Optional | No | Production admin-panel switch |
| `ADMIN_PANEL_DEVELOPMENT_ENABLED` | Local | Optional | No | Local admin-panel switch |
| `VERCEL_ENV` | Vercel | Set by platform | No | Deployment context; drives Preview guard |
| `PREVIEW_DATABASE_TARGETS` | Preview | Optional | No | Approved Preview DB target allowlist |
| `PREVIEW_DANGEROUS_OPERATIONS_ENABLED` | Preview | Optional | No | Explicit Preview mutation opt-in |
| `NODE_ENV` | Runtime | Set by platform | No | Runtime mode |
| `PRISMA_QUERY_LOG` | Local | Optional | No | Enables Prisma query logging when set |
| `ARCHIFY_BIN` | Local scripts | Optional | No | Architecture screenshot/render tool |
| `PORT` | Local scripts | Optional | No | E2E server port |
| `SUCCESS_E2E_URL` | Local scripts | Optional | No | Order-success E2E target URL |
| `HOME` | Tooling | Set by OS | No | Used by architecture tooling |

`*` The Supabase anon key is designed to be public, but access must still be
governed by RLS/policies. Never expose the service-role key.

## 25. Deployment

- **Platform:** Vercel, region `bom1` (`vercel.json`).
- **Build:** `next build` on Node.js `>=20.9.0`; `postinstall` runs
  `prisma generate`.
- **Database:** PostgreSQL/Supabase. Preview and Production currently share one
  database credential in Vercel; the code guard refuses Preview DB access unless
  an isolated target is allow-listed.
- **Migrations:** production application is an operator action, not part of
  `main` deploys. `scripts/db/deploy.ts` refuses the production path on `main`.
  See `docs/production/migration-history.md`; never rewrite migrations.
- **Cron:** `GET /api/cron/reconcile-paid-notifications` daily at `03:00` UTC
  (`0 3 * * *`). Requires `CRON_SECRET` and
  `PAID_NOTIFICATION_RECONCILE_SINCE`; fails closed.
- **Cache:** in-process tags plus cross-environment purge via
  `POST /api/revalidate`; production URL is forwarded from local/Preview only.
- **Maintenance:** production setting `maintenanceMode.production`, checked by
  the proxy with a 30-second cache; admin/auth/maintenance bypass.
- **Admin kill switch:** `ADMIN_PANEL_PRODUCTION_ENABLED`/`ADMIN_PANEL_ENABLED`;
  proxy returns 404, but auth is still enforced.
- **Preview:** no checkout/admin/cron/DB access without explicit isolation.
- **Secrets:** set per Vercel scope; never in Git or client bundles.

## 26. Data Flow Examples

### Product purchase

```text
Browser add-to-cart
  → cart action validates session/guest token, product, options, add-on,
    colors, stock and limits
  → CartItem snapshot (config, add-on, colors)
Checkout
  → server recomputes price/stock/coupon/shipping
  → POST /api/payments/create-order
  → local Order + Payment + Razorpay order
Razorpay checkout
  → POST /api/payments/verify (signature)
  → settle-order: Payment/Order/Tracking/timeline + CouponUsage
  → OrderNotification outbox row
  → paid email via Resend template
  → capability-protected success page
```

### Guest cart/login

```text
Guest adds item → kf_cart cookie token → guest Cart
Sign in
  → profile cart upsert
  → atomic guestToken claim
  → content-keyed merge (quantity cap, custom lines preserved)
  → guest cart deleted only on success
  → guest orders claimed via claim-guest-orders
```

### Service / repair order

```text
Mods configurator or Workshop intake
  → validates device/service/quantities/package/photos
  → POST /api/services/create-order or repair action
  → SERVICE/REPAIR Order + OrderService/OrderRepair
  → Delhivery quote/legs (pickup + return, if applicable)
  → Razorpay or manual/offline path
  → admin shipment/pickup workflow
```

### Admin catalog update

```text
Admin form
  → requirePermission("product", ...)
  → Zod validation + image handling
  → Prisma update + inventory movement if stock changed
  → cache tag invalidation
  → optional /api/revalidate forward from local/Preview
```

## 27. Business Rules

- All money is integer paise; format only at display boundaries.
- Server is authoritative for price, discount, shipping, tax, stock,
  availability, and order ownership.
- Coupons are re-validated at order creation; usage is recorded in
  `CouponUsage`; the denormalized `usedCount` is best-effort.
- Guest checkout is allowed, but success pages require the order capability,
  not just the order number.
- Product options/add-ons/colors are snapshotted into cart/order rows.
- Custom/made-to-order cart lines stay separate and quantity-limited.
- One service job per cart; adding another replaces it.
- Payment settlement is idempotent; refunds are keyed by Razorpay refund ID and
  clamped to captured amount.
- Orders with refund evidence cannot be deleted; deletion is logical.
- Paid email is at most one automatic attempt per `(orderId, type)`.
- Service shipping requires provider quotes; no invented fallback rates.
- Package limits: 100 cm per side, 250 cm combined, 30 kg.
- Admin permissions are deny-by-default for roles outside `ADMIN` except the
  explicit `STAFF_PERMISSIONS` entries.
- Preview must never operate on production data or integrations.
- Maintenance mode is production-only and bypassed for admin/auth/maintenance.
- Architecture generator output is generated evidence, not an editable source.

## 28. Files Safe to Modify

Usually low-risk if conventions/tests are respected:

- Documentation in `docs/`, this map, `README.md`.
- Presentational components and copy in `src/components/**`.
- Pure utility functions in `src/lib/utils/**` with tests.
- Formatting/labels in `src/lib/orders/index.ts`, `product-labels.ts`, SEO copy.
- CSS/global styles.
- Tests and non-production check scripts.
- New forward-only migrations (with explicit schema-change approval and full
  validation).

"Low-risk" does not mean "no validation": run typecheck, lint, and the closest
checks after any change.

## 29. Files Requiring Extra Care

Do not casually edit:

- `src/proxy.ts` — auth error sanitization, maintenance, admin kill switch,
  redirects.
- `src/lib/auth/admin.ts`, `src/lib/auth/roles.ts`,
  `src/lib/auth/better-auth.ts`, `src/lib/auth/session.ts` — authorization.
- `src/lib/config/preview-guard.ts`, `deployment.ts`, `environment.ts` —
  fail-closed deployment policy.
- `src/app/api/payments/*`, `src/lib/payments/*` — money, signatures,
  settlement, refunds.
- `src/lib/payments/settle-order.ts`, `webhook-core.ts`,
  `refund-accounting.ts` — idempotency/accounting invariants.
- `src/lib/notifications/*`, `src/lib/email/outbound*.ts`,
  `src/lib/email/templates.ts` — delivery/suppression/idempotency.
- `src/lib/shipping/delhivery.ts`, `pickup-config.ts`, service-leg logic —
  charges and external side effects.
- `src/lib/cart.ts`, `src/app/actions/cart.ts` — guest merge and line identity.
- `src/app/admin/actions/*` — privileged mutations; keep permission checks.
- `prisma/schema.prisma` and `prisma/migrations/**` — production history;
  forward-only, never rewrite.
- `src/lib/db/prisma.ts` — client lifecycle + Preview guard.
- `src/lib/caching/*`, `/api/revalidate` — allow-listed cross-environment
  invalidation.
- `src/lib/images/cloudinary.ts`, `validation.ts`, `/api/uploads` — deletion and
  upload safety.
- `next.config.ts`, `vercel.json`, `.env.example`, `.vercelignore` — deployment
  and secret boundaries.
- `docs/architecture/keebforge.runtime.*` and `public/architecture.html` —
  generated artifacts; regenerate deliberately.
- `scripts/db/*`, `scripts/e2e/*` — database safety; several intentionally
  refuse dangerous targets.
