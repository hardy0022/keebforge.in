# KeebForge.in

Mechanical keyboard and peripherals store and service workshop based in Jammu, India. Browse brand-new and
clearance keebs, order keyboard/mouse mods and repairs, build to order, and track the whole thing end to end.

## Tech stack

| Layer | Technology | Used for |
| --- | --- | --- |
| Framework | [Next.js 16](https://nextjs.org) (App Router, React Compiler) | Rendering, routes, server actions, incremental static work |
| UI | [React 19](https://react.dev), [TypeScript](https://www.typescriptlang.org) | Components, typed DSL |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) primitives, [motion](https://motion.dev) | Theming, motion |
| Database / ORM | [PostgreSQL](https://www.postgresql.org) hosted on [Supabase](https://supabase.com) + [Prisma](https://www.prisma.io) 6 | Durable state, schema, migrations |
| Realtime | [Supabase Realtime](https://supabase.com/docs/guides/realtime) | Live order tracking pushes (PII-free) |
| Auth | [Better Auth](https://www.better-auth.com) | Email/password + Google/Discord OAuth, org-style RBAC |
| Payments | [Razorpay](https://razorpay.com) | Inline checkout, order creation, HMAC-verified webhooks |
| Shipping | [Delhivery](https://www.delhivery.com) (Kinko) | Quote, rate calculation, labels |
| Media | [Cloudinary](https://cloudinary.com) (custom `next/image` loader) | Upload, transforms, delivery |
| Email | [Resend](https://resend.com) | Password reset, repair/inquiry notifications |
| Analytics | [Vercel Analytics](https://vercel.com/analytics), [Vercel Speed Insights](https://vercel.com/docs/speed-insights), Google Tag Manager, [Umami](https://umami.is) | Web vitals, events, GSC/merchant verification |
| Hosting | [Vercel](https://vercel.com) (region `bom1`, Mumbai) | Deployments, edge proxy, static routing |
| Validation | [Zod](https://zod.dev) | Schema validation at route/action boundaries |

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/app` | Next.js App Router — pages, route groups, API route handlers, server actions |
| `src/components` | React components (app shell, shop, checkout, admin, UI primitives) |
| `src/lib` | Server-only libraries: auth, catalog, checkout, orders, shipping, payments, admin, realtime, images, caching |
| `src/proxy.ts` | Edge proxy — cased redirects, maintenance mode guard, `/auth/error` scrubbing |
| `prisma/` | Prisma schema + migrations (single Supabase Postgres database) |
| `docs/architecture/` | Generated interactive architecture map (see below) |
| `public/` | Static assets (OG image, favicon, architecture map served at `/architecture.html`) |

## Architecture Map

The block below is the single source of truth for the platform architecture. The visitor-facing interactive
map (`/architecture.html`), plus `docs/architecture/keebforge.runtime.html` and
`docs/architecture/keebforge.runtime.architecture.json`, are all **generated** from it. Nothing in the repo
derives an independent node/connection definition. Edit this block, then run `npm run architecture:map`.

```yaml
architecture:
  meta:
    title: "KeebForge Platform Architecture"
    subtitle: "Next.js App Router commerce for keyboard & mouse mods, repairs, and custom builds"
    output: "keebforge.runtime.html"
  views:
    - id: overview
      label: "Overview"
      focus: [browser, vercel-edge, nextjs, api, postgres, catalog]
      note: "How traffic moves from the browser to durable state and partners."
    - id: checkout-payments
      label: "Checkout & Payments"
      focus: [browser, nextjs, payments, razorpay, order, postgres]
      note: "Razorpay inline checkout, HMAC-verified webhook, idempotent verification."
    - id: tracking
      label: "Live Order Tracking"
      focus: [order, realtime, postgres, browser]
      note: "PII-free tracking cache broadcast over Supabase Realtime, public page subscribes."
    - id: security
      label: "Security & Auth"
      focus: [auth, nextjs, vercel-edge, images, google-discord]
      note: "Better Auth RBAC, admin gate, upload sniffing, edge scrubbing of /auth/error."
  groups:
    - id: access
      name: "Access & Edge"
      kind: region
      nodes:
        - id: browser
          label: "Visitors"
          sublabel: "Browser / Mobile"
          type: frontend
        - id: vercel-edge
          label: "Vercel Edge proxy"
          sublabel: "maintenance · redirects"
          type: cloud
          tag: "30s memoized toggle"
    - id: app
      name: "Application (Next.js)"
      kind: region
      nodes:
        - id: nextjs
          label: "App Router"
          sublabel: "React 19 Server Components"
          type: backend
        - id: server-actions
          label: "Server Actions"
          sublabel: "cart · checkout · admin"
          type: backend
        - id: api
          label: "Route Handlers"
          sublabel: "payments · shipping · uploads"
          type: backend
        - id: auth
          label: "Better Auth"
          sublabel: "OAuth · RBAC"
          type: security
          col: 5
    - id: commerce
      name: "Commerce & Services"
      kind: region
      nodes:
        - id: catalog
          label: "Catalog & Caching"
          sublabel: "cache 5 min · invalidate"
          type: backend
        - id: order
          label: "Orders & Tracking"
          sublabel: "orders · PII-free tracking"
          type: backend
        - id: payments
          label: "Payments"
          sublabel: "inline · webhook"
          type: backend
        - id: images
          label: "Image / Upload API"
          sublabel: "uploads · sniffed"
          type: backend
        - id: shipping
          label: "Shipping"
          sublabel: "Kinko rates · quotes"
          type: backend
    - id: data
      name: "Data & Realtime"
      kind: region
      nodes:
        - id: postgres
          label: "PostgreSQL"
          sublabel: "Supabase hosted · Prisma"
          type: database
        - id: realtime
          label: "Supabase Realtime"
          sublabel: "order status pushes"
          type: messagebus
    - id: external
      name: "External Services"
      kind: region
      nodes:
        - id: supabase
          label: "Supabase"
          sublabel: "hosted Postgres + RT"
          type: external
        - id: resend
          label: "Resend"
          sublabel: "transactional email"
          type: external
        - id: razorpay
          label: "Razorpay"
          sublabel: "payments"
          type: external
        - id: cloudinary
          label: "Cloudinary"
          sublabel: "image CDN + transforms"
          type: external
        - id: delhivery
          label: "Delhivery"
          sublabel: "courier · labels"
          type: external
        - id: google-discord
          label: "Google / Discord"
          sublabel: "OAuth providers"
          type: external
  connections:
    - id: browser-edge
      from: browser
      to: vercel-edge
      label: "HTTPS"
      variant: emphasis
      labelAt: [166, 324]
    - id: edge-app
      from: vercel-edge
      to: nextjs
    - id: app-actions
      from: nextjs
      to: server-actions
      route: straight
    - id: actions-catalog
      from: server-actions
      to: catalog
    - id: catalog-db
      from: catalog
      to: postgres
    - id: order-db
      from: order
      to: postgres
    - id: order-realtime
      from: order
      to: realtime
    - id: api-payments
      from: api
      to: payments
    - id: provider-oauth
      from: auth
      to: google-discord
      variant: security
      fromSide: bottom
      toSide: top
    - id: pay-create
      from: payments
      to: razorpay
      fromSide: bottom
      toSide: top
    - id: ship-quote
      from: shipping
      to: delhivery
    - id: img-up
      from: images
      to: cloudinary
    - id: db-provider
      from: postgres
      to: supabase
  cards:
    - dot: cyan
      title: Platform
      items:
        - "Next.js 16 App Router on Vercel (bom1 · Mumbai)"
        - "PostgreSQL via Supabase + Prisma ORM"
        - "Env-gated maintenance mode (30s memoized, bypass /admin /auth /maintenance)"
    - dot: violet
      title: Commerce
      items:
        - "DB-persisted cart with guest claim"
        - "Server-authoritative coupons & prices (never trust client math)"
        - "Razorpay inline checkout, HMAC-verified idempotent webhooks"
        - "Delhivery Kinko shipping quotes"
    - dot: emerald
      title: Data & Realtime
      items:
        - "defineCached stamps (catalog 5 min, stable 1 h, per-tag invalidation)"
        - "PII-free public tracking cache (orders armed only from admin writes)"
        - "Supabase Realtime push for live order status"
    - dot: amber
      title: Security & Auth
      items:
        - "Better Auth: email/password + Google/Discord, organization RBAC"
        - "Admin gates via requireAdminContext"
        - "MIME-sniffed uploads, server-chosen media folders"
        - "Draft/removed products excluded from structured data & OG"
```

### Regenerating the interactive map

```bash
npm run architecture:map
```

Reads the `architecture:` block above, lays out the nodes automatically, validates it against the
[archify](https://github.com/tt-a1i/archify) architecture schema, and writes:

- `docs/architecture/keebforge.runtime.html` — canonical interactive viewer
- `docs/architecture/keebforge.runtime.architecture.json` — resolved diagram spec (derived, do not hand-edit)
- `public/architecture.html` — served to visitors at `/architecture.html`

## Local development

**Prerequisites**

- Node.js 20+ and npm
- A Supabase-hosted Postgres database (`DATABASE_URL`) with the Prisma schema migrated
- Service credentials for better-auth, Razorpay, Cloudinary, Delhivery, Resend, and Supabase Realtime —
  see `.env.example` for the full variable list and shape

**Commands**

| Command | Purpose |
| --- | --- |
| `npm install` | Install + `prisma generate` (postinstall) |
| `npm run dev` | Start the dev server |
| `npm run db:migrate` | Apply schema changes locally (`prisma migrate dev`) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check:coupons` | Coupon validation self-check |
| `npm run check:environment` | Environment/shape validation |
| `npm run architecture:map` | Regenerate the interactive architecture map |

The edge proxy (`src/proxy.ts`) enforces cased-path redirects, an env-gated per-environment maintenance
toggle (bypassing `/admin`, `/auth`, `/maintenance`), and scrubs raw upstream text from `/auth/error`.
Server routes run on the Node.js runtime; images go through a custom Cloudinary `next/image` loader.