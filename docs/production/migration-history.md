# Migration History — Production Reconciliation (Read-Only)

## Current status (verified 2026-10-11)
- Repository migrations: **44** directories (`prisma/migrations/*`).
- Production `_prisma_migrations` ledger: **53** records total.
  - **45** COMPLETED, **8** ROLLED_BACK, **0** UNFINISHED, **0** ANOMALOUS.
- Extra in prod vs current repo: `20260823120000_organization_auth` (1) — historical, preserved below.
- Local migrations with no verified production ledger record: **0**.
- Schema verified present in production:
  - `OrderNotification` outbox with its `NotificationType` / `NotificationStatus` enums, the
    unique `(orderId, type)` index, the `status` and `orderId` indexes, and the cascade FK to `Order`.
  - `ProductOptionGroup.selectionMode` (`ProductOptionSelectionMode`).
  - `Refund.razorpayPaymentId`.
- Server: PostgreSQL 17.6 at `aws-0-ap-south-1.pooler.supabase.com`.

### Newly applied migrations (were "pending application")
| Migration | Applied (production) | Verification |
|---|---|---|
| `20261002120001_refund_razorpay_payment_id` | 2026-10-05 | COMPLETED ledger record; `Refund.razorpayPaymentId` present |
| `20261007000000_add_product_option_selection_mode` | 2026-10-07 | COMPLETED ledger record; `ProductOptionGroup.selectionMode` present |
| `20261010120000_order_paid_notifications` | 2026-10-11 | COMPLETED ledger record; `OrderNotification` + enums + indexes + FK present |

The 2026-10-11 apply used the guarded production migration path (read-only target
verification, typed migration-name confirmation, read-only pre/post-check). That tooling
lives on the `chore/guarded-production-migration-path` branch; on `main` the same script
deliberately refuses. Applying the branch's tooling is a transient, operator-driven step and
is **not** merged into the release.

## Phase 5B audit snapshot (historical)
- Current repository migrations at audit time: 44 directories (`prisma/migrations/*`).
- Production `_prisma_migrations` ledger (snapshot from the Phase 5B audit): 50 records total.
- Classifications at audit time: 42 COMPLETED, 8 ROLLED_BACK, 0 UNFINISHED, 0 ANOMALOUS.
- Extra in prod vs current repo: `20260823120000_organization_auth` (1) — historical, preserved below.
- Local migrations with no *verified* production ledger record at audit time: 3.
  - `20261002120001_refund_razorpay_payment_id` — verified absent at audit (see "Newly applied migrations").
  - `20261007000000_add_product_option_selection_mode` and `20261010120000_order_paid_notifications` — authored **after** the audit. All three are now applied and verified (see "Current status").
- Every other local migration directory appears as COMPLETED in the audit ledger.

## Rolled-back migrations (re-applied)
The following were applied, rolled back, then re-applied in production. Checksums: in all cases the COMPLETED record’s checksum matches the current local migration file.

| Migration | Rolled back checksum | Completed checksum | Local matches completed | Notes |
|---|---|---|---|---|
| 20260819150000_rls_defense_in_depth | caba6be4... | f6146029... | Yes | File changed between first apply and re-apply. |
| 20260822120000_cart_service_item | 8305b840... | 8305b840... | Yes | Identical. |
| 20260827180000_clear_all_auth_data | 59ee4a9d... | 6899bd3c... | Yes | Changed. |
| 20260827190000_servicegroup_to_mods | fb802582... | 255d8912... | Yes | Changed. |
| 20260828120000_review_snapshots_and_images | 87acca3e... | 5b8289e7... | Yes | Changed. |
| 20260901120000_remove_repair_media_type | f7e034ae... | d25ca1ff... | Yes | Changed. |
| 20260902220726_remove_category_image_desc_parent | 4b0ed05d... | 5c0c943c... | Yes | Changed. |
| 20260906120000_add_tracking_messages | ed9b6d103... | ed9b6d103... | Yes | Identical. |

This explains 7 checksum mismatches observed; all current local files match the completed applied state.

## Production-only historical migration
- Name: `20260823120000_organization_auth`
- Prod ledger checksum: `5629281fed9f72de405899d25e48830c0fe72331da6a13abed055b56984a6217`
- Git provenance: Present at commits `06af3b7` and parent `8598f41^` (`prisma/migrations/20260823120000_organization_auth/migration.sql`)
- Recovered checksum matches prod.
- Effect: Creates `session.activeOrganizationId`, `organization`, `member`, `invitation` with appropriate FKs, indexes, and unique constraints.

## Incident migrations (verified)
- `20260827201000_restore_organization_auth`: checksum matches local; COMPLETED, not rolled back.
- `20261002120000_refund_accounting`: checksum matches local; COMPLETED, not rolled back.

## Reproducibility
- Clean scratch replay of the 41 migrations that existed at Phase 2B succeeded. The 42nd (`20261002120001_refund_razorpay_payment_id`), 43rd (`20261007000000_add_product_option_selection_mode`) and 44th (`20261010120000_order_paid_notifications`) have not been replayed on scratch; all three are **applied to and verified in production** (see "Current status").
- Reproducing the exact historical production migration sequence is not possible from current repository alone because it would require the intermediate rolled-back SQL versions. This is a historical artifact, not a defect.
- Distinction: **clean rebuild from current history** is supported; **bit-for-bit replay of prod’s historical sequence** is not reconstructible from current files.

## Applied migration notes
- `20261002120001_refund_razorpay_payment_id`: adds the nullable `Refund.razorpayPaymentId`
  column and its index, so a refund stays traceable to its Razorpay payment even when no
  local `Payment` row exists. Authored in Phase 5B.1; applied to production 2026-10-05.
- `20261007000000_add_product_option_selection_mode`: creates the
  `ProductOptionSelectionMode` enum (`SINGLE`/`MULTIPLE`) and adds
  `ProductOptionGroup.selectionMode NOT NULL DEFAULT 'SINGLE'`. Forward-only and additive;
  default preserves existing radio behaviour. Applied to production 2026-10-07.
- `20261010120000_order_paid_notifications`: creates the `OrderNotification` outbox
  (`NotificationType`, `NotificationStatus`, the unique `(orderId, type)` index, status and
  orderId indexes, and the cascade FK to `Order`). Forward-only and additive. Applied to
  production 2026-10-11; also exercised on scratch by the rollback-guarded
  `e2e:notification-outbox` integration harness.
- Precondition honoured for each: production was confirmed at the schema level of its
  predecessor (`20261002120000_refund_accounting` for `20261002120001`;
  `20261002120001` for `20261007000000`; `20261007000000` for
  `20261010120000`) before the forward-only apply.
- The audited count enforced by `scripts/e2e/scratch-guard.test.ts` is 44 (the array lists all
  44 directories). That guard is a deliberate tripwire: it pins the exact expected migration
  set so a schema change cannot land as an incidental diff. Bump the array and this section
  together.

## Policy
- Never rewrite, delete, rename, squash, or resolve historical migrations as a shortcut.
- All future schema changes must be forward-only migrations.
- The recovered historical migration is preserved here as documentation evidence only; it must not be reintroduced into `prisma/migrations/`.
