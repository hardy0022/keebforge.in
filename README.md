# KeebForge

KeebForge is a mechanical keyboard store and workshop based in Jammu, India.
The platform combines the storefront, custom builds, modifications, repairs,
checkout, payments, shipping, and order tracking in one Next.js application.

This file is the project entry point and documentation index. Start with
[the code map](./code-map.md) for the current file, route, data, and environment
map.

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
[the code map §24](./code-map.md#24-environment-variables). Never commit
`.env.local` or print secret values.

Use a local database for development. Production migrations are operator-only;
the normal deploy script refuses to run. Validate migrations against the
disposable scratch database documented in [`production/`](./production/).

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
is in [the code map §22](./code-map.md#22-tests).

## Documentation

- [Code map](./code-map.md) — authoritative orientation for the current tree:
  routes, APIs, server actions, libraries, Prisma models, scripts, environment
  variables, and business rules.
- [Authorization and RLS snapshot](./architecture/authorization-and-rls.md) —
  enforcement model and open runtime-role verification.
- [Production configuration checklist](./production/configuration-checklist.md) —
  read-only production env verification and safety switches.
- [Migration history](./production/migration-history.md) — authoritative
  production ledger, checksums, and replay limits.
- [Launch test matrix](./production/launch-test-matrix.md) — blocking launch
  verification status.
- [Resend templates](./resend-templates.md) — template IDs, variables, and
  operational checks.

Never apply migrations, alter production settings, or print secret values while
using these documents. Production migration execution is an operator action; the
normal `main` deploy path refuses it.

## Architecture

The runtime architecture viewer is generated from the architecture spec and is
a snapshot, not a live map:

- [Runtime architecture spec](./architecture/keebforge.runtime.json) — canonical
  generated spec, pinned to revision `4f205ddc3048e13057035b362fcd71110be816cd`.
- [Runtime architecture viewer](./architecture/keebforge.runtime.html) —
  generated HTML for the same snapshot (mirrored to
  [`public/architecture.html`](../public/architecture.html)).

[![KeebForge platform architecture](https://keebforge.in/architecture-share-card.png)](https://keebforge.in/architecture.html)

Regenerate deliberately with `npm run architecture:map` after a tree change is
committed. Visual-check screenshots and machine-specific receipts are generated
locally on demand and are intentionally ignored (`.gitignore`), not stored in the
repository.

## Deployment

The application deploys on Vercel (`bom1`) with a PostgreSQL/Supabase database.
Production environment variables and migration verification are documented in
[`production/`](./production/). Preview deployments fail closed for database
access, checkout, admin, and cron unless explicitly isolated and enabled.

The paid-notification reconciliation cron runs daily at `03:00` UTC and requires
`CRON_SECRET` plus `PAID_NOTIFICATION_RECONCILE_SINCE`.

## Maintenance

- Code map: [docs/code-map.md](./code-map.md)
- Architecture regeneration and generated evidence: [Architecture](#architecture)
- Deployment and environment facts: [Code map §24–25](./code-map.md#24-environment-variables)
