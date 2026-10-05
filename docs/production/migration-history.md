# Migration History — Production Reconciliation (Read-Only)

## Summary
- Current repository migrations: 42 directories (`prisma/migrations/*`).
- Production `_prisma_migrations` ledger (from audit): 50 records total.
- Classifications: 42 COMPLETED, 8 ROLLED_BACK, 0 UNFINISHED, 0 ANOMALOUS.
- Extra in prod vs current repo: `20260823120000_organization_auth` (1). Missing from prod vs current: 1 — see "Pending application" below.
- Local-but-not-in-prod: `20261002120001_refund_razorpay_payment_id`. Every other local dir appears as COMPLETED in prod.

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
- Clean scratch replay of the 41 migrations that existed at Phase 2B succeeded. The 42nd (`20261002120001_refund_razorpay_payment_id`) has NOT been replayed or applied anywhere.
- Reproducing the exact historical production migration sequence is not possible from current repository alone because it would require the intermediate rolled-back SQL versions. This is a historical artifact, not a defect.
- Distinction: **clean rebuild from current history** is supported; **bit-for-bit replay of prod’s historical sequence** is not reconstructible from current files.

## Pending application (not yet in any environment)
- `20261002120001_refund_razorpay_payment_id`: adds the nullable `Refund.razorpayPaymentId`
  column and its index, so a refund stays traceable to its Razorpay payment even when no
  local `Payment` row exists. Authored in Phase 5B.1 and verified only by offline
  regression tests; it has **not** been applied to production and has **not** been
  replayed on scratch.
- Precondition for application: production must be confirmed at schema level
  `20261002120000_refund_accounting` (COMPLETED per the audit above) before this
  forward-only migration is run.
- Adding this migration required bumping the audited count enforced by
  `scripts/e2e/scratch-guard.test.ts` from 41 to 42. That guard is a deliberate
  tripwire: it pins the exact expected migration set so a schema change cannot land
  as an incidental diff. Bump the count and this section together.

## Policy
- Never rewrite, delete, rename, squash, or resolve historical migrations as a shortcut.
- All future schema changes must be forward-only migrations.
- The recovered historical migration is preserved here as documentation evidence only; it must not be reintroduced into `prisma/migrations/`.
