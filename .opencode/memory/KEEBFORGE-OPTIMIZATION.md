# KeebForge Optimization Handoff

## Project
- KeebForge Next.js application
- Next.js 16 App Router
- TypeScript
- Prisma + PostgreSQL/Supabase
- Better Auth
- Razorpay
- Cloudinary
- Delhivery
- Vercel
- Ponytail + OpenCode are being used for codebase auditing/optimization

## Objective
We are performing a careful full-codebase cleanup and optimization.

Goals:
- remove genuinely dead/unnecessary code
- consolidate genuinely duplicated code
- reduce client JavaScript
- reduce hydration
- reduce duplicate DB/API/auth work
- improve Vercel resource efficiency
- simplify architecture
- preserve functionality
- preserve security
- preserve SEO
- preserve payment/cart/checkout correctness

IMPORTANT:
Do not optimize merely for fewer lines.
Do not blindly merge components.
Do not weaken security or business logic.

## Completed

### Batch 1
Completed and verified.

Removed:
- src/app/tw-animate.css
- src/components/ui/Button.tsx
- src/components/ui/PriceDisplay.tsx
- src/components/ui/blur-fade.tsx
- src/components/ui/blur-fade-image.tsx
- src/lib/checkout/coupon-eval.ts

Removed approximately 2,095 lines.

globals.css dead CSS was removed after repository-wide usage verification.

Coupon evaluator/self-check was safely consolidated into coupons.ts.

Validation:
- typecheck clean
- lint: 0 errors, 17 pre-existing img warnings
- check:coupons: all 13 asserts pass
- production build passes
- 63/63 static pages built
- no stale .next/types

IMPORTANT:
Ponytail's initial CSS findings included false positives.
Live classes were checked before deletion and were preserved.

### Batch 2
Completed and verified.

Changes:
1. Removed dead Delhivery parsers:
   - parseBulkWaybills
   - parseExpectedTat
   - wbFail
   - tatFail
   - associated self-check sections

2. Simplified 6 motion icons:
   - arrow-big-left
   - arrow-big-right
   - cpu
   - sliders-horizontal
   - plug-connected
   - travel-bag

   Removed dead ref plumbing and unused:
   - scaledStrokeWidth
   - IconEasing
   - DEFAULT_STROKE_WIDTH

3. Removed dead admin functions:
   - saveMod
   - checkAction

4. Deleted dead admin catch-all:
   - src/app/admin/[...slug]/page.tsx
   - removed /admin/activity nav/role entry

5. Deleted 3 no-op checkout layouts.

6. Consolidated redirects into next.config.ts:
   - /cart
   - /checkout
   - /profile
   - /account/addresses
   - collapsed /order → /checkout → /shop/checkout

7. Unused export candidates were checked; remaining candidates were verified live and NOT removed.

8. Removed direct sharp dependency.

9. Moved shadcn CLI to devDependencies.

10. Simplified maintenance page:
    - removed dead "Check Again" button/hooks
    - page is now a Server Component

11. Inlined INDIAN_STATES into StateSelect.tsx and removed:
    - src/lib/config/indian-states.ts

12. Removed verified legacy SUPABASE_* entries from .env.example.

13. Removed verified zero-reference public assets.

Validation:
- tsc --noEmit clean
- eslint 0 errors
- 17 pre-existing img warnings
- next build passes
- check:coupons passes
- all routes render
- no stale .next/types

## Current state

Batches 1 and 2 are COMPLETE.

Do NOT redo these changes.

Do NOT blindly rerun the entire cleanup.

Next work should continue from the remaining Ponytail audit findings.

## Remaining high-value work

The important remaining candidates are:

1. CheckoutClient.tsx
   - approximately 2,160-line client monolith
   - identified internal duplication:
     - PaymentMethodCard (~70 lines)
     - BillingAddressSection (~150 lines)
     - validateDelivery / validateForm duplication
     - triplicated address-prefill logic
   - This is HIGHER RISK because checkout/payment behavior must remain correct.

2. Merge getRevenueSeries / getAnalyticsSeries
   - near-identical PAID-order daily bucketing
   - approximately 40 lines of duplication
   - preserve admin analytics correctness.

3. Reuse existing helpers:
   - getRazorpay() is duplicated
   - availableQuantity is duplicated
   - cart-owner resolution is reimplemented
   - inline Math.random() order numbers should use canonical generateOrderNumber()
   - preserve payment/order correctness

4. Duplicate SORTS listing:
   - shop/[category]/page.tsx
   - ShopCatalog

5. Duplicate admin ActionForm patterns.

6. Duplicate checkout skeleton implementations.

7. Other previously identified findings should be evaluated individually rather than blindly applied.

## Explicitly OUT OF SCOPE / DEFERRED

Ponytail previously identified these for normal review:

- nested <main> in SiteChrome + auth layout
- ~100KB motion/react homepage animations
  - HowWeWork
  - FeaturedBuild
- unbounded account orders query
- admin customers over-fetch

Do not change these unless they are explicitly reviewed and approved.

## Important engineering rules

Always:

MEASURE
→ UNDERSTAND
→ CHANGE
→ VERIFY

For every meaningful change:

- search repository usage first
- understand Server vs Client boundaries
- check dynamic imports
- check runtime behavior
- make the smallest safe change
- run typecheck
- run lint
- run relevant tests/checks
- run production build where appropriate

If a change causes a regression:
- identify the change responsible
- revert/fix that change
- do not stack additional unrelated changes on top

## Security rules

NEVER weaken:

- Better Auth
- authentication
- authorization
- admin permissions
- ownership checks
- user isolation
- input validation
- Razorpay verification
- webhook verification
- server/client secret boundaries

Never move secrets to client code.

Never trust client-side price, inventory, discount, or payment state.

## Checkout/payment rule

Treat checkout, cart and Razorpay code as HIGH RISK.

The server remains authoritative for:
- prices
- inventory
- discounts
- shipping
- checkout totals
- payment status

Do not refactor these aggressively.

## Component rule

When consolidating components:

Merge only when they genuinely share:
- behavior
- responsibility
- lifecycle
- styling
- business rules

Do NOT create giant universal components with dozens of flags.

Do NOT turn Server Components into Client Components just to share code.

Minimizing file count is NOT the goal.

## Tooling workflow

Ponytail commands:

/ponytail-audit
= broad repo audit

/ponytail-review
= review changes already made

/ponytail-gain
= inspect measured impact

Use /ponytail-review after significant batches.

## Tomorrow's starting procedure

When this memory file is read in a new OpenCode session:

1. Read this file first.
2. Inspect git diff/status.
3. Confirm Batches 1 and 2 are already complete.
4. Do NOT redo completed cleanup.
5. Run a lightweight verification if necessary.
6. Review remaining findings.
7. Start with the safest high-value remaining optimization.
8. Work in small batches.
9. Validate after each batch.

Before making any new changes, explain briefly:
- what will be changed
- why
- expected performance/maintenance benefit
- risk level

Then proceed only with the approved batch.

## Current checkpoint

BATCH 1: COMPLETE
BATCH 2: COMPLETE
BATCH 3: NOT STARTED

Next likely task:
Carefully refactor CheckoutClient.tsx and related duplication, but only after inspecting the current code and establishing a baseline.

Do not assume the old audit findings are still 100% accurate.
Re-verify current code before modifying anything.