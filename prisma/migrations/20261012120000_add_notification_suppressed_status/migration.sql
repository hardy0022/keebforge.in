-- Add SUPPRESSED to the order-notification lifecycle.
--
-- A paid-order confirmation is now gated by the per-email-type admin toggles
-- before any provider call. When the admin has disabled the type, nothing is
-- sent and nothing should be: recording that as FAILED would make it look like a
-- definitive provider rejection and make an explicit retry permissible, which
-- would silently resume mail the admin deliberately turned off.
--
-- SUPPRESSED is therefore a distinct terminal, non-retryable state:
--   PENDING -> IN_PROGRESS -> SENT | FAILED | NEEDS_REVIEW | SUPPRESSED.
--
-- The row still exists (so reconciliation's "no row" gap-fill never re-queues
-- it) and only FAILED remains eligible for automatic/manual retry. The new value
-- is added without being used in this migration, so it is safe inside a
-- transaction on PostgreSQL.

-- AlterEnum
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'SUPPRESSED';
