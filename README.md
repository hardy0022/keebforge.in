# KeebForge

KeebForge is a mechanical keyboard store and workshop based in Jammu, India.
The platform combines the storefront, custom builds, modifications, repairs,
checkout, payments, shipping, and order tracking in one Next.js application.

## What it includes

- Product catalog, categories, clearance/custom sections, product options,
  colors, add-ons, cart, coupons, and guest checkout
- Keyboard/mouse mods configurator and repair intake with photo uploads
- Razorpay payments, signed webhooks, refunds, and order capabilities
- Delhivery rate quotes, shipments, pickups, and customer tracking
- Customer accounts, addresses, order history, reviews, and tracking
- Admin dashboard for orders, payments, products, inventory, customers,
  coupons, reviews, shipments, notifications, and site settings

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Prisma 6,
PostgreSQL/Supabase, Better Auth, Razorpay, Delhivery, Resend, Cloudinary, and
Vercel.

## Local development

Requires Node.js **20.9+** and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Fill the required values in `.env.local`. The tracked template contains names
and placeholders only; the complete environment map is in
[docs/code-map.md §24](docs/code-map.md#24-environment-variables). Never commit
`.env.local` or print secret values.

Use a local database for development. Production migrations are operator-only,
and the normal deploy script refuses the production path on `main`.

## Common commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run check:security` | Offline security/settlement/email/preview suite |
| `npm run check:admin-orders` | Admin order filter checks |
| `npm run check:product-options` | Product option checks |
| `npm run check:product-addon` | Product add-on checks |
| `npm run check:environment` | Environment/maintenance checks |
| `npm run check:scratch-db` | Scratch DB safety guard |

Individual checks and E2E commands are listed in `package.json`; the grouped map
is in [docs/code-map.md §22](docs/code-map.md#22-tests).

## Documentation

- [Documentation index](docs/README.md)
- [Code map](docs/code-map.md) — routes, APIs, server actions, libraries,
  Prisma models, scripts, environment variables, and business rules
- [Production configuration checklist](docs/production/configuration-checklist.md)
- [Migration history](docs/production/migration-history.md)
- [Launch test matrix](docs/production/launch-test-matrix.md)
- [Resend email templates](docs/resend-templates.md)

## Architecture

The runtime architecture viewer is generated from the architecture spec and is
a snapshot, not a live map:

[![KeebForge platform architecture](https://keebforge.in/architecture-share-card.png)](https://keebforge.in/architecture.html)

Regenerate deliberately with `npm run architecture:map` after a tree change is
committed. For the current code map, use [docs/code-map.md](docs/code-map.md).

## Deployment

The application deploys on Vercel (`bom1`) with a PostgreSQL/Supabase database.
Production environment variables and migration verification are documented in
`docs/production/`. Preview deployments fail closed for database access,
checkout, admin, and cron unless explicitly isolated and enabled.

The paid-notification reconciliation cron runs daily at `03:00` UTC and requires
`CRON_SECRET` plus `PAID_NOTIFICATION_RECONCILE_SINCE`.
