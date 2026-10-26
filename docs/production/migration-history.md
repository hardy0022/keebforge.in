# Migration History — Production Reconciliation (Read-Only)

## Current status (production ledger verified 2026-10-26)
- Repository migrations: **48** directories (`prisma/migrations/*`).
- Production `_prisma_migrations` ledger: **58** rows total.
  - **49** COMPLETED, **9** ROLLED_BACK, **0** UNFINISHED, **0** ANOMALOUS.
- Effective completed migrations: **49** = 48 repository migrations + 1 production-only migration.
- Pending repository migrations: **0**.
- The 9 rolled-back rows are historical attempts; each has a later COMPLETED row. No migration
  exists only as a rolled-back row.
- Extra in prod vs current repo: `20260823120000_organization_auth` (1) — historical, preserved below.
- Migrations 45–48 were applied on 2026-10-24, match the repository checksums, and are present in
  the production schema. See the verification table below.
- The 2026-10-11 verification record is preserved below. Its totals describe that date, not the
  current state.
- Server: PostgreSQL 17.6 at `aws-0-ap-south-1.pooler.supabase.com`.

### Additional schema verified present on 2026-10-26
- `NotificationStatus.SUPPRESSED`.
- `Product` addon fields (`addonDescription`, `addonEnabled`, `addonPrice`, `addonTitle`) and the
  `CartItem` / `OrderItem` addon snapshots.
- `ProductColorOption` with its product index, product FK, and cart/order FKs;
  `ColorOptionGroup(BASE, SECONDARY)`.
- Secondary-color heading/snapshot fields on `Product`, `CartItem`, and `OrderItem`, with both
  secondary-color FKs.

## Verification snapshot: 2026-10-11
- Repository migrations at that verification: **44** directories. Migrations 45–48 did not yet
  exist in the repository and are documented separately below.
- Production `_prisma_migrations` ledger at the 2026-10-11 verification: **53** records total.
  - **45** COMPLETED, **8** ROLLED_BACK, **0** UNFINISHED, **0** ANOMALOUS.
- Extra in prod vs current repo: `20260823120000_organization_auth` (1) — historical, preserved below.
- Local migrations with no verified production ledger record at that time: **0** — all 44
  repository migrations then present were verified.
- Schema verified present at that time:
  - `OrderNotification` outbox with its `NotificationType` / `NotificationStatus` enums, the
    unique `(orderId, type)` index, the `status` and `orderId` indexes, and the cascade FK to `Order`.
  - `ProductOptionGroup.selectionMode` (`ProductOptionSelectionMode`).
  - `Refund.razorpayPaymentId`.

### Newly applied migrations (2026-10-05 to 2026-10-11)
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

### Repository additions after the 2026-10-11 verification
These four directories were added after the 2026-10-11 verification. They were applied to
production on 2026-10-24 and verified against the production ledger and schema on 2026-10-26.

| Migration | Repository change | Status at 2026-10-11 | Current status |
|---|---|---|---|
| `20261012120000_add_notification_suppressed_status` | Adds terminal `NotificationStatus.SUPPRESSED` for admin-disabled email types. | Not in repository | Applied 2026-10-24; COMPLETED; checksum matches |
| `20261016000000_add_product_single_addon` | Adds the optional single product add-on and its cart/order snapshots. | Not in repository | Applied 2026-10-24 after a rolled-back attempt; COMPLETED; checksum matches |
| `20261016010000_add_product_color_options` | Adds `ProductColorOption` plus cart/order color snapshots and FKs. | Not in repository | Applied 2026-10-24; COMPLETED; checksum matches |
| `20261024000000_add_secondary_product_color_options` | Adds the BASE/SECONDARY color grouping, heading, and secondary color snapshots. | Not in repository | Applied 2026-10-24; COMPLETED; checksum matches |

## Migrations 45–48 — production verification (2026-10-26)
The production ledger and schema were checked read-only on 2026-10-26. All four migrations are
present, their completed ledger checksums match the repository, and no related migration is
pending or unfinished.

| Migration | Applied (UTC) | Ledger state | Checksum | Schema verification |
|---|---|---|---|---|
| `20261012120000_add_notification_suppressed_status` | 2026-10-24 16:17:39 | COMPLETED | Matches repository | `NotificationStatus.SUPPRESSED` present |
| `20261016000000_add_product_single_addon` | 2026-10-24 16:18:27 | COMPLETED after rollback | Matches repository | Product addon fields and cart/order addon snapshots present |
| `20261016010000_add_product_color_options` | 2026-10-24 16:18:34 | COMPLETED | Matches repository | `ProductColorOption`, product index, and cart/order FKs present |
| `20261024000000_add_secondary_product_color_options` | 2026-10-24 16:18:40 | COMPLETED | Matches repository | `ColorOptionGroup`, secondary-color fields, and secondary FKs present |

`20261016000000_add_product_single_addon` first started at 2026-10-24 16:17:39 UTC and was
rolled back at 16:18:27 UTC. A subsequent attempt completed at 16:18:27 UTC; that completed
row's checksum matches the repository. No unfinished or partial state remains.

Repository history: migration 45 was added in `3e28fe2` (2026-10-13); migrations 46–48 were
added in `bf4548b` (2026-10-24).

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
The following have a rolled-back ledger row and a later COMPLETED row in production. This is a
historical record of attempts, not a set of currently pending migrations. For each row, the
completed record's checksum matches the current repository file.

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
| 20261016000000_add_product_single_addon | 67151e97... | 67151e97... | Yes | Rolled back and re-applied on 2026-10-24. |

The earlier 2026-10-11 record said this explained 7 checksum mismatches. The 2026-10-26 audit
observed six mismatched rolled-back checksums plus one separate completed-row mismatch
(`20260822000000_payment_integrity`); the earlier count is preserved here but does not
reconcile to the current rows.

## Production-only historical migration
- Name: `20260823120000_organization_auth`
- Prod ledger checksum: `5629281fed9f72de405899d25e48830c0fe72331da6a13abed055b56984a6217`
- Git provenance: Present at commits `06af3b7` and parent `8598f41^` (`prisma/migrations/20260823120000_organization_auth/migration.sql`)
- Recovered checksum matches prod.
- Effect: Creates `session.activeOrganizationId`, `organization`, `member`, `invitation` with appropriate FKs, indexes, and unique constraints.

## Incident migrations (verified)
- `20260827201000_restore_organization_auth`: checksum matches local; COMPLETED, not rolled back.
- `20261002120000_refund_accounting`: checksum matches local; COMPLETED, not rolled back.

## Completed checksum discrepancy: `20260822000000_payment_integrity`
This is a historical provenance/documentation discrepancy. It is not a pending, unfinished, or
partially applied migration.

- Production applied the migration on 2026-08-21 13:43 UTC; the ledger row is COMPLETED.
- Production checksum:
  `662ea7dc0de7f42322629a3eed29cfd585ccb909d6b3bc7641ba658da46aac5e`
- Current repository checksum:
  `cc67727b5439ab0f6bf8c32056769a53406fbad4b85d921605a71a1cd63b1990`
- The current repository file first appears in git on 2026-08-23 (`c3466ad`). No committed
  repository version matching the production checksum was found.
- The production DDL effects are present: `Payment.failureReason`, `Payment.updatedAt` with no
  default, `Payment_razorpayPaymentId_key`, and `Payment_razorpayPaymentId_idx`.
- Treat this as a checksum-provenance difference from a pre-commit variant, not evidence that
  the migration needs to be applied again.
- Do **not** edit or rewrite the migration file. Do **not** manually edit `_prisma_migrations`
  to make the checksums match.

## Reproducibility
- Clean scratch replay of the 41 migrations that existed at Phase 2B succeeded. The 42nd (`20261002120001_refund_razorpay_payment_id`), 43rd (`20261007000000_add_product_option_selection_mode`) and 44th (`20261010120000_order_paid_notifications`) have not been replayed on scratch; all three are **applied to and verified in production** (see "Current status"). Migrations 45–48 were applied to production on 2026-10-24 and verified on 2026-10-26; they were not part of the Phase 2B replay, and this document does not claim a scratch replay for them.
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
- The audited count enforced by `scripts/e2e/scratch-guard.test.ts` is 48 (the array lists all
  48 directories). That guard is a deliberate tripwire: it pins the exact expected migration
  set so a schema change cannot land as an incidental diff. Bump the array and this section
  together.

## Policy
- Never rewrite, delete, rename, squash, or resolve historical migrations as a shortcut.
- All future schema changes must be forward-only migrations.
- The recovered historical migration is preserved here as documentation evidence only; it must not be reintroduced into `prisma/migrations/`.
