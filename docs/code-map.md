# KeebForge Code Map

Authoritative orientation for the current repository. Last reviewed: **2026-10-27**.

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
models, 23 enums, 48 repository migrations, 65 page routes, 25 route handlers
(23 under `src/app/api` plus the admin CSV export and the reset-password relay),
and 37 test files (35 in `src/lib`, 2 in `scripts`).

## 2. Repository Structure

```text
.
├── docs/                  Architecture, production runbooks, email templates, this map
├── prisma/                Schema + 48 forward-only migration directories
├── public/                Served static assets and generated architecture page
├── scripts/               Architecture generator, guarded DB tooling, E2E harnesses, email check
├── src/
│   ├── app/               Pages, layouts, globals.css, API route handlers, server actions
│   ├── components/        Client/server UI grouped by domain
│   ├── lib/               Business logic, integrations, guards, pure helpers, tests
│   └── proxy.ts           Next.js request proxy: admin kill switch, redirects, maintenance
├── .env.example           Tracked environment template (names, no real secrets)
├── .env.e2e.local.example Scratch DB template (names, loopback-only example values)
├── next.config.ts         Redirects, image loader, body limits, headers, tracing excludes
├── package.json           Scripts and dependency versions
└── vercel.json            Region `bom1` + paid-notification reconciliation cron
```

Ignored local state includes `.env*` (except the templates), `.next/`, `node_modules/`,
coverage, `.vercel/`, `deploy-checklist.md`, `opencode.json`, `.opencode/`,
generated architecture visual-check evidence, and archived audit copies under
`docs/MD-FILES/`.

### 2.1 Top-level configuration

| Path | Purpose |
|---|---|
| `package.json` | Dependency versions and every npm check/E2E command |
| `package-lock.json` | Locked dependency tree; regenerate with npm, never hand-edit |
| `next.config.ts` | Redirects, custom Cloudinary image loader, server-action/proxy body limits, CORS headers, Prisma tracing excludes |
| `tsconfig.json` | TypeScript settings and the `@/*` path alias |
| `eslint.config.mjs` | ESLint flat config (Next.js rules) |
| `postcss.config.mjs` | Tailwind CSS 4 PostCSS plugin |
| `components.json` | shadcn/ui generator configuration |
| `vercel.json` | Region `bom1` and the daily paid-notification reconciliation cron |
| `.env.example` | Tracked environment template: names, placeholders, and safety comments only |
| `.env.e2e.local.example` | Loopback-only scratch database template for guarded E2E commands |
| `.gitignore` | Excludes secrets, build output, local tooling, and generated visual-check evidence |
| `.vercelignore` | Prevents local secrets/state from being uploaded by `vercel deploy` |

### 2.2 `src/app`

Route tables are in §4. This table maps the supporting files and route groups.

| Path | Responsibility |
|---|---|
| `layout.tsx` | Root metadata/viewport, fonts, analytics, organization/website JSON-LD, site chrome |
| `page.tsx` | Home page composition and homepage metadata |
| `globals.css` | Tailwind entry, design tokens, global styles and animations |
| `not-found.tsx` | Global 404 |
| `robots.ts`, `sitemap.ts` | Crawler rules and the database-backed sitemap |
| `(public)/*` | About, contact, FAQ, privacy, returns, shipping information, terms |
| `(auth)/*` | Login, register, forgot password, OAuth callback/error, auth layout |
| `account/*` | Account layout, profile, orders, settings, newsletter action |
| `shop/*` | Main shop, all products, clearance, custom, category, cart, checkout, loading/error states |
| `product/[slug]/*` | Product detail, metadata, client configurator, product error boundary |
| `checkout/CheckoutClient.tsx` | Shared product/service checkout implementation used by the shop and mods wrappers |
| `mods/*` | Mods catalog, mods checkout wrapper, client, loading state |
| `workshop/*` | Repair intake page and loading state |
| `work/*` | Portfolio list and project detail |
| `write-review/*` | Review chooser, composer, and edit flows |
| `order/success/[orderNumber]/*` | Capability-protected order success and payment-exchange pages |
| `reset-password/*` | Reset form page and the `[token]` relay to Better Auth |
| `track-order/page.tsx` | Public order/shipment tracking lookup |
| `maintenance/*`, `unauthorized/page.tsx` | Maintenance landing and access-denied state |
| `actions/*` | Storefront server actions; exported actions are listed in §4.5 |
| `admin/*` | Admin layout, pages, managers, CSV export, and privileged actions |
| `api/*` | JSON/API route handlers; see §4.4 |

### 2.3 `src/components`

Trivial presentational primitives are grouped rather than documented one by one.

| Group | Key files and responsibility |
|---|---|
| `account/` | `AccountLayout`, `AddressBook`, `OrderCard`, `SettingsPanel`, `DeleteReviewButton` |
| `admin/` | `AdminShell`, `ActionForm`, `AdminPagination`, `RevenueOrdersChart`; `catalog/` brand/category/import forms; `orders/` address, financial, shipping, note, timeline, delete, header panels; `products/` form, detail, color options; `reviews/` moderation; `work/` form/list |
| `auth/` | `AuthShell`, `SignInForm`, `RegisterForm`, `OAuthButtons`, `ResendVerificationForm` |
| `cart/`, `checkout/` | `CartView`, `CouponPanel` |
| `contact/`, `support/` | `InquiryForm`, `SupportSection`, `TrackOrder` |
| `home/` | Hero, featured build, services ticker, how-we-work, workshop pin/mods, why-forge, reviews, CTA, reveal/scroll animation |
| `icons/` | Shared inline SVG icons and icon types |
| `layout/` | `SiteChrome`, `SiteHeader`, `Footer`, `FooterStatus`, `ShowOnSite`, `UnderDevelopmentNotice`, public-settings reader |
| `mods/` | `ModConfigurator`, `AddressPicker` |
| `order/`, `payments/` | Order payment summary, copy-payment-id, Razorpay script loader, affordability widget |
| `repair/` | `RepairIntake` |
| `reviews/` | Review composer/form/card/summary/stars/body/pagination/photo strip/section |
| `shop/` | Product card/gallery/configurator/colors/add-on, add-to-cart, catalog/filter/grid/empty/skeletons, image cycler/media, shipping-warranty, related products |
| `ui/` | Shared primitives: `Field`, `Panel`, `PageHero`, `PasswordField`, `PillRadio`, `PinCodeInput`, `StateSelect`, `Breadcrumbs`, `CartToaster`, `CtaSection`, `FaqList`, `CardIcons`, `AccountModal`, `RouteProgress`, number ticker, text reveal |
| `work/` | `WorkImageSlider` |
| `Analytics.tsx` | Vercel Analytics and Speed Insights mount point |

### 2.4 `src/lib`

This is the business-logic and integration layer. Test files sit beside the
modules they cover.

| Module | Key files and responsibility |
|---|---|
| `admin/` | `analytics.ts`, `catalog.ts`, `customers.ts`, `customer-rows.ts`, `index.ts`, `order-filters.ts`, `pagination.ts`, `pricing.ts` — dashboard stats, admin catalog/customer reads, filtered order queries, pagination, paise parsing |
| `auth/` | `better-auth.ts`, `auth-client.ts`, `session.ts`, `admin.ts`, `roles.ts`, `profile.ts`, `auth-error.ts`, `register-error.ts`, `resend-verification.ts`, `send-verification-email.ts` — Better Auth config, session/profile resolution, RBAC, safe auth errors, verification mail |
| `caching/` | `cache.ts`, `external-revalidate.ts`, `revalidate-request.ts` — tag/TTL cache helpers, cross-deployment purge client, allow-listed revalidation request parsing |
| `cart.ts` | Cart owner resolution, guest cookie, content-keyed line identity, atomic guest-to-profile merge, availability |
| `catalog/` | `data.ts`, `shop.ts`, `product-options.ts`, `product-addon.ts`, `product-labels.ts` — catalog reads, shop sections/filters, option pricing/config keys, single add-on resolution, display labels |
| `checkout/coupons.ts` | Coupon eligibility, discount math, order-create data, usage recording |
| `config/` | `deployment.ts`, `environment.ts`, `preview-guard.ts` — deployment mode, admin/maintenance switches, Preview database/operation fail-closed policy |
| `db/prisma.ts` | Prisma singleton behind a Proxy so the Preview database guard runs before client construction |
| `email/` | `templates.ts`, `outbound.ts`, `outbound-policy.ts`, `email-policy.ts`, `email-settings.ts` — remote template IDs/builders, send wrapper, recipient suppression/redirect, per-type enablement |
| `faq.ts`, `home.ts`, `reviews.ts` | Static FAQ, cached homepage data, cached review summaries/lists |
| `http/read-json-body.ts` | Bounded JSON body reader for route handlers |
| `images/` | `asset-root.ts`, `cloudinary.ts`, `cloudinary-url.ts`, `loader.ts`, `read-dimensions.ts`, `validation.ts` — app asset detection, Cloudinary upload/delete/rename, URL transforms, custom Next image loader, dimension/MIME validation |
| `mods/` | `pricing.ts`, `server.ts` — service pricing/totals and active mod configuration loading |
| `notifications/` | `paid-confirmation.ts`, `send-paid-confirmation.ts`, `reconcile-cron.ts`, `resend-diagnostics.ts` — paid-email builders, outbox claim/send/state transitions, scheduled reconciliation, sanitized Resend diagnostics |
| `orders/` | `index.ts`, `tracking.ts`, `variant-info.ts`, `claim-guest-orders.ts`, `shipping-choice.ts` — order labels/numbering, tracking projection sync, variant snapshots, guest-order claim, pickup/ship choice |
| `payments/` | `payment-status.ts`, `razorpay-signature.ts`, `settle-order.ts`, `refund-accounting.ts`, `webhook-core.ts`, `pay-inline-core.ts`, `order-capability.ts`, `order-access.ts`, `razorpay-pay.ts`, `razorpay-customer.ts`, `rate-limit.ts`, `billing-details.ts`, `exchange-href.ts` — state normalization, signatures, idempotent settlement, refunds, capability cookies, retry payments, rate limits |
| `rate-limit/action.ts` | Server-action rate-limit response helper |
| `realtime/` | `track-notify.ts`, `track-sub.ts` — Supabase broadcast emit/subscribe for tracking updates |
| `security/` | Offline security, payment, refund, webhook, capability, and order-success tests |
| `seo.tsx` | Site URL, default OG image, metadata builder, JSON-LD helpers |
| `shipping/` | `delhivery.ts`, `package-limits.ts`, `pickup-config.ts`, `pickup-slots.ts`, `shipping-estimate.ts`, `track-phases.ts` — Delhivery client, package rules, pickup/return addresses, pickup slots, service leg derivation, customer phase labels |
| `utils/` | `cn`, `email`, `ist`, `limits`, `money`, `password`, `phone`, `slugify`, `username` — shared pure helpers and validation limits |
| `validation/customer-input.ts` | Reusable Zod field schemas for customer-facing forms |

### 2.5 `prisma`

| Path | Responsibility |
|---|---|
| `schema.prisma` | 43 models and 23 enums for auth, catalog, cart, orders, payments, shipping, reviews, coupons, work, settings, notifications |
| `migrations/*/migration.sql` | 48 forward-only production migrations; never edit, rename, delete, or squash |
| `migrations/migration_lock.toml` | Prisma provider lock |

### 2.6 `scripts`

See §21 for the script-by-script safety map.

### 2.7 `docs`

See §23 for the documentation map.

### 2.8 Public asset map

Every tracked file in `public/` is used. There are no unreferenced public assets.

| Asset | Purpose | Used by |
|---|---|---|
| `favicon.png` | Site icon | `src/app/layout.tsx` metadata |
| `hero-background.webp` | Homepage hero keyboard image | `src/components/home/HomeHero.tsx`, homepage metadata |
| `og-default.webp` | Default 1200×630 social share image | `src/lib/seo.tsx` |
| `architecture.html` | Generated public runtime architecture viewer | `docs/README.md` link, `https://keebforge.in/architecture.html` |
| `architecture-share-card.png` | Social share card for the architecture page | `docs/README.md` image, `https://keebforge.in/architecture-share-card.png` |

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
| `/reset-password/[token]` | Public with emailed token | Route-handler relay to Better Auth's reset callback |
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

### 4.4 Route handlers

This table lists every `route.ts` in the app, including the two outside `/api`
(admin CSV export and password-reset relay). `sitemap.xml` and `robots.txt` are
generated by `src/app/sitemap.ts` and `src/app/robots.ts`.

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
| `/admin/products/export` | `GET` | Admin product CSV export; requires `product:view` |
| `/reset-password/[token]` | `GET` | Validates/forwards an emailed password-reset token to Better Auth |

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
- **Order tracking:** public lookup at `/track-order` with safe
  tracking/Delhivery scans. The proxy matcher excludes the legacy `track/`
  namespace, `api/`, and static file extensions.
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
production. `npm run db:deploy` is an unconditional refusal; there is no enabled
production migration command in this repository. Use the disposable scratch
database to validate, and follow the read-only production docs for verification.

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
- `Order.type` is `PRODUCT`, `SERVICE`, `REPAIR`, or `COMBINED`.
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

| Script | Purpose | Safe environment | Production safe? | Creates/mutates data? | Required env |
|---|---|---|---|---|---|
| `scripts/db/deploy.ts` | Unconditional refusal shim replacing the old `prisma migrate deploy` | Any | Yes — writes nothing | No | None |
| `scripts/db/production-migration-path.ts` | Inert production-plan type/refusal; deliberately has no enabled path | Any | Yes — writes nothing | No | None |
| `scripts/e2e/migrate-scratch.ts` | Scratch `deploy` / `status` / `diff` | Loopback scratch only | No — refuses non-scratch targets | Scratch DB only | `.env.e2e.local` `DATABASE_URL`, `DIRECT_URL` |
| `scripts/e2e/migrate-scratch-plan.ts` | Pure planner for hostile-value tests | Offline | Yes | No | None |
| `scripts/e2e/scratch-guard.ts` | Shared loopback allowlist and target guard; pins the 48-migration set | Offline | Yes | No | None |
| `scripts/e2e/scratch-guard.test.ts` | Guard regression tests, including the migration-count tripwire | Offline | Yes | No | None |
| `scripts/e2e/dbcheck.ts` | Verifies the connected server is the approved scratch database | Scratch only | No — read-only, refuses remote | Read-only | `.env.e2e.local` |
| `scripts/e2e/auth-preflight.ts` | Applies/removes the scratch-only `auth.uid()` / `auth.jwt()` fixture | Scratch only | No — never production | Scratch schema only | `.env.e2e.local`; optional `--database` |
| `scripts/e2e/local-env.ts` | Validates and pins both DB variables from `.env.e2e.local`; imported by the other E2E entrypoints | Scratch/offline | Yes — no DB access itself | No | `.env.e2e.local` |
| `scripts/e2e/e2e-server.ts` | Starts `next start` against the guarded scratch DB | Local loopback | No — local server only | No | `.env.e2e.local`; optional `PORT` |
| `scripts/e2e/run-order-success-page.ts` | Guarded runner for the order-success-page E2E test | Scratch + local server | No | Scratch test rows | `.env.e2e.local`; `SUCCESS_E2E_URL` |
| `scripts/e2e/run-notification-outbox.ts` | Guarded runner for the outbox integration test | Scratch | No | Transaction, always rolled back | `.env.e2e.local` |
| `scripts/e2e/seed.ts` | Seeds disposable `E2E_` category/product/cart | Loopback scratch only | No — refuses unsafe targets | Scratch rows only | `.env.e2e.local` |
| `scripts/e2e/seed.mjs` | Intentional guarded refusal shim; does not seed | Any | Yes — no DB contact | No | None |
| `scripts/e2e/scratch-auth.sql` | Scratch-only auth-function fixture | Scratch only | No — must not run in production | Scratch schema only | None |
| `scripts/architecture/architecture-map.mjs` | Generates the architecture viewer and public copy | Local | Yes — writes docs/public HTML only | No DB | `ARCHIFY_BIN`, `HOME` |
| `scripts/email/resend-shop-order-paid.ts` | Prints the shop paid-order Resend template payload; no network | Offline | Yes | No | None |
| `scripts/email/resend-shop-order-paid.test.ts` | Verifies the printable template payload | Offline | Yes | No | None |

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

`src/lib` contains 35 test files and `scripts/` contains 2 more (37 total),
including tests not individually exposed as npm scripts
(`customers.test.ts`, `account-linking.test.ts`, `register-error.test.ts`,
`email-settings.test.ts`, etc.). When changing shared logic, run the closest
check plus `npm run typecheck`.

## 23. Documentation

| Path | Role |
|---|---|
| `docs/README.md` | Project overview, setup/commands, and documentation index |
| `docs/code-map.md` | This authoritative code/file/route/env map |
| `docs/architecture/authorization-and-rls.md` | Auth/RLS audit snapshot; runtime DB role unverified |
| `docs/architecture/keebforge.runtime.json` | Canonical architecture spec, pinned to revision `4f205dd...` |
| `docs/architecture/keebforge.runtime.html` | Generated architecture viewer |
| `public/architecture.html` | Public copy generated by the architecture script |
| `docs/production/configuration-checklist.md` | Read-only production config verification |
| `docs/production/launch-test-matrix.md` | Launch verification matrix |
| `docs/production/migration-history.md` | Authoritative migration ledger/reconciliation |
| `docs/resend-templates.md` | Resend template variables/operations |

Architecture visual-check screenshots and receipts are generated evidence, not
portable source. They are ignored via `.gitignore` and should be produced locally
when a visual check is needed; do not commit machine-specific artifact paths. The
architecture spec is a snapshot and may lag the current tree; do not regenerate
it as part of routine cleanup unless explicitly requested.

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
  `main` deploys. `scripts/db/deploy.ts` is an unconditional refusal and
  `production-migration-path.ts` deliberately has no enabled path. Validate
  against the disposable scratch database. See
  `docs/production/migration-history.md`; never rewrite migrations.
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

### Repair / custom request

```text
RepairIntake form (guest or signed-in)
  → submitRepairRequest: Preview refusal + per-IP rate limit
  → Zod validation; saved address or manual pickup/shipping address
  → optional photo bytes sniffed/dimension-checked before any write
  → Order(type REPAIR, status REQUESTED) + OrderRepair row
  → optional Cloudinary upload into the order folder
  → Resend repair-request template to the customer/ops recipient
  → admin repair queue decides quote / accept / schedule
```

### Admin product creation

```text
/admin/products/new
  → requirePermission("product", "create")
  → ProductForm → saveProduct action
  → Zod validation + slug/SKU uniqueness + option/add-on/color parsing
  → Prisma Product (+ variants/options/images) create
  → revalidatePath("/admin/products", "/admin/products/inventory", "/shop")
  → client redirects to /admin/products/[id]/edit
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
- Product visibility is server-enforced: `active` must be true, and `DRAFT` /
  `ARCHIVED` are never purchasable. `CUSTOM` products are orderable unless the
  status is `OUT_OF_STOCK`; `NEW` / `CLEARANCE` require positive
  `stock - reservedQuantity` or an active variant with stock.
- The add-on is a single optional boolean per product, resolved against live
  product data. It is purchasable only when `addonEnabled` is true and a title
  exists; a crafted selected flag cannot invent a title or price, and a missing
  or non-positive price resolves to zero.
- Colors use two explicit groups, `BASE` and `SECONDARY`. The first color in a
  non-empty group is the default; a submitted color must belong to the matching
  group, and a selection is rejected when that group is empty. Both selections
  are validated server-side and snapshotted.
- Order notifications have six states: `PENDING` (only claimable state),
  `IN_PROGRESS` (send in flight or crashed mid-flight; never auto-claimed),
  `SENT` (provider returned an id), `FAILED` (definitive 4xx; retryable),
  `NEEDS_REVIEW` (timeout/network/5xx ambiguity; never auto-retried), and
  `SUPPRESSED` (admin-disabled type; terminal, not retryable). Only one automatic
  attempt is allowed per `(orderId, type)`; re-queueing `FAILED` is an explicit
  operator action.
- Custom/made-to-order cart lines stay separate and quantity-limited.
- One service job per cart; adding another replaces it.
- Payment settlement is idempotent; refunds are keyed by Razorpay refund ID and
  clamped to captured amount.
- Orders with refund evidence cannot be deleted; deletion is logical.
- Service shipping requires provider quotes; no invented fallback rates.
- Package limits: 100 cm per side, 250 cm combined, 30 kg.
- Admin permissions are deny-by-default for roles outside `ADMIN` except the
  explicit `STAFF_PERMISSIONS` entries.
- Preview must never touch production data or integrations. Prisma refuses to
  initialise unless the Postgres target is in `PREVIEW_DATABASE_TARGETS`;
  dangerous Preview operations additionally require
  `PREVIEW_DANGEROUS_OPERATIONS_ENABLED`; guest actions that upload to
  Cloudinary or send mail refuse before any side effect.
- Maintenance mode is production-only and bypassed for admin/auth/maintenance.
- Architecture generator output is generated evidence, not an editable source.

## 28. Files Safe to Modify

Usually low-risk if conventions/tests are respected:

- Documentation in `docs/`, including this map and `docs/README.md`.
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
