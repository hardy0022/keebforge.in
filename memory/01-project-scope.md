# 01 — Project Scope

## The business

KeebForge is a solo, Jammu & Kashmir-based workshop that:
- repairs mechanical keyboards (and some mice),
- performs soldering/desoldering, switch lubing, stabilizer tuning, firmware,
- builds fully custom keyboards (the main revenue driver),
- sells keyboard parts/accessories (Phase 5+).

The site is the business's public face **and** its order pipeline. Every page leads toward contacting the owner or placing an order.

## What this site is

A rebuild of `static.keebforge.in` (a hand-written static HTML site) into a modern, data-driven Next.js application. It is **not** a rewrite of `order.keebforge.in` (that was a third-party Next.js starter — read-only reference only).

- **Static reference:** `static.keebforge.in/` — old site; read-only reference for content, tone, and design.
- **Order reference:** `order.keebforge.in/` — starter template with a `supabase/` folder and docs; read-only, never copied from blindly.

Both sibling folders exist only as references and must not be edited.

## Scope (in)

- Public marketing/content pages (services, work/portfolio, reviews, about, faq, terms, contact).
- Shop with product catalog, filtering, product detail pages, cart (guest + logged-in).
- Contact inquiries delivered by email (Resend).
- Ordering: service orders, product orders, repair requests — with a real money pipeline (Razorpay) in Phase 6.
- Customer accounts, order tracking, admin dashboard (later phases).
- SEO: sitemap, robots, metadata, JSON-LD for products and services.

## Scope (out)

- No multi-tenant / multi-vendor anything.
- No physical stock sync, no marketplace integration.
- No social features, no CMS — content is seeded/managed via the database.
- No international payments; single currency INR.

## Audiences

1. **Customers** (primary): keyboard enthusiasts in India who want builds, repairs, or parts. Reach the owner and order.
2. **Owner/operator**: must be able to manage products, services, orders, and content through a future admin dashboard.
3. **Search engines**: the site must rank for services like "keyboard repair Bangalore", "keyboard build India".

## Design language

- Theme: "v3 lime" — lime-400 accent (`#a3e635`) on near-black, Tailwind v4 tokens.
- Typography: Geist (via next/font).
- Tone: direct, technical, hobbyist-friendly, no corporate fluff.
- Content style inherited from the old static site, but all prices/pricing text are pulled from the database (never hardcoded — see `06-decisions.md`).

## Success criteria

- Every public page renders from the database, not hardcoded values.
- A customer can find a service, build a cart, and complete checkout with a real payment (Phase 6).
- The owner can see and manage everything (Phase 7 admin).