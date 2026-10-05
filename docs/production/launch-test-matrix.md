# Launch Test Matrix

## Legend
- **Blocking**: Launch-blocking (must pass before production).
- **Method**: How to verify (unit/integration/E2E/offline).
- **Evidence**: What proves it passed.
- **Status**: Existing/New/Partial.

## 1. Migration & Schema
| Test | What it proves | Method | Evidence | Blocking | Status | Owner Phase |
|---|---|---|---|---|---|---|
| Migration replay (clean) | Current 41 migrations build clean schema | Scratch DB (authorized) | `db:scratch:status` all applied, schema consistent | YES | Existing (Phase 2B validated) | 5B/7 |
| Migration status (prod) | Prod ledger consistent | Prod read-only (authorized) | 42 completed, no unfinished/anomalous | YES | Existing | 7/8 |
| Migration history documented | Divergence understood | Doc review | migration-history.md complete | YES | New (5A) | 5A |

## 2. Authentication & Authorization
| Test | What it proves | Method | Evidence | Blocking | Status | Owner Phase |
|---|---|---|---|---|---|---|
| Auth/RLS model documented | Enforcement boundary clear | Doc review | authorization-and-rls.md | YES | New (5A) | 5A |
| Runtime DB role verified | Role identity known | Config review (authorized) | Checklist item verified | YES | New | 6 |
| Admin permission enforcement | Server-side checks work | Integration | Permission tests pass | YES | Existing/Partial | 7/8 |
| Guest checkout auth boundaries | Capability model enforced | Integration/E2E | Capability tests pass | YES | Existing | 7/8 |

## 3. Payments & Webhooks
| Test | What it proves | Method | Evidence | Blocking | Status | Owner Phase |
|---|---|---|---|---|---|---|
| Signature verification | Webhook authenticity | Unit | check:payment-signature passes | YES | Existing | 7/8 |
| Rate limiting | Abuse resistance | Unit | check:rate-limit passes | YES | Existing | 7/8 |
| Webhook handling | Idempotency/replay | Unit+Integration | check:webhook passes | YES | Existing | 7/8 |
| Payment status logic | Correct state transitions | Unit | check:payment-status passes | YES | Existing | 7/8 |
| Refund accounting | Correct money math/idempotency | Unit | check:refund-accounting passes | YES | Existing | 7/8 |
| Payment endpoints | Security/validation | Unit | check:payment-endpoints passes | YES | Existing | 7/8 |
| Order refund evidence | Evidence preservation | Unit | check:order-refund-evidence passes | YES | Existing | 7/8 |
| Refund reconciliation (missing payment) | Link preserved when no local Payment | Integration | Test covers planRefundAccounting + webhook path | YES | New/Partial | 5B |
| Webhook idempotency edge cases | Replay safety | Integration | Additional cases covered | YES | Partial | 5B |

## 4. Shipping, Checkout, Orders
| Test | What it proves | Method | Evidence | Blocking | Status | Owner Phase |
|---|---|---|---|---|---|---|
| Server-authoritative totals | Amount charged matches server totals | Integration | Tests validate totals server-side | YES | Partial | 5B |
| Shipping validation | Shipping amounts validated server-side | Integration | Tests pass | YES | Partial | 5B |
| Order deletion guard | Refund evidence never destroyed | Unit/Integration | Guard tested (existing) | YES | Existing | 7/8 |
| Refund evidence retention | Protection enforced | Unit | Existing tests pass | YES | Existing | 7/8 |

## 5. Production Readiness & Smoke
| Test | What it proves | Method | Evidence | Blocking | Status | Owner Phase |
|---|---|---|---|---|---|---|
| Config checklist complete | All required config verified (read-only) | Config review | configuration-checklist.md all verified | YES | New | 6 |
| Security suite passes | Core security gates green | Offline | `npm run check:security` passes | YES | Existing | 7/8 |
| Scratch guard passes | DB safety enforced | Offline | `npm run check:scratch-db` passes | YES | Existing | 7/8 |
| Typecheck/lint | Code quality gates | Offline | `npm run typecheck && npm run lint` | YES | Existing | 7/8 |
| Production smoke tests | Critical flows work post-deploy | Prod smoke (authorized) | Smoke checklist results | YES | New | 8 |
| Monitoring/alerts | Observability configured | Ops review | Verified | YES | New | 8 |
