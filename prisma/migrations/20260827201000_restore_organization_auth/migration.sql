-- Restore the Better Auth organization plugin tables: organization, member, invitation.
--
-- WHY THIS EXISTS
--
-- `schema.prisma` has always declared these three models (they are `@@map`ped to
-- lowercase table names), but no migration in this repository creates them. Two
-- migrations that did were lost in a history cleanup and are not present at HEAD:
--
--   20260823120000_organization_auth
--   20260827120000_add_organization_plugin
--
-- Both created the same three tables with identical column definitions. The first
-- was plain DDL; the second was the idempotent rewrite. Neither survives, so a
-- fresh database built from this history aborts later, at
-- 20260827213000_add_organization_metadata, with
-- `relation "organization" does not exist`.
--
-- This migration is their consolidated replacement. It is intentionally
-- idempotent: environments that applied the original migrations before the
-- cleanup already have these tables, and re-running this must be a no-op rather
-- than a failure. That matters because `prisma migrate deploy` will consider this
-- migration pending in those environments — its directory name is new — and will
-- attempt to apply it against a database where the tables already exist.
--
-- PROVENANCE AND THE TWO DELIBERATE DEVIATIONS
--
-- Column names, types, defaults, keys and constraints are taken verbatim from
-- 20260823120000_organization_auth (recoverable with
-- `git show backup-before-history-cleanup:prisma/migrations/20260823120000_organization_auth/migration.sql`).
-- The two source migrations agreed on every column, so nothing was merged.
--
-- 1. `member_organizationId_userId_key` is created as a UNIQUE INDEX, not as
--    `ALTER TABLE ... ADD CONSTRAINT ... UNIQUE`. The second deleted migration
--    used the constraint form, but every other `@@unique` in this repository's
--    history — including `Payment_razorpayPaymentId_key` — is a plain
--    `CREATE UNIQUE INDEX`, which is also what Prisma itself emits for `@@unique`
--    on PostgreSQL. Using the constraint form here would make this the only
--    migration in the repository with that shape and risks a permanent
--    `prisma migrate dev` drift report on the member table.
--
-- 2. `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` and
--    `EXCEPTION WHEN duplicate_object` are used throughout, per the idempotent
--    source migration.
--
-- WHAT THIS DELIBERATELY DOES NOT CREATE
--
-- Three things belong to later migrations, which run against these tables
-- unconditionally. Creating them here would break those migrations:
--
--   - `organization.metadata`  → 20260827213000_add_organization_metadata
--     (`ADD COLUMN IF NOT EXISTS`)
--   - `invitation_inviterId_idx` and `invitation_inviterId_fkey`
--     → 20260901110000_fix_org_member_inviter_relation, both UNCONDITIONAL.
--     Creating either here would make that migration fail with
--     42701 duplicate index / 42710 duplicate object.
--   - `session.activeOrganizationId` → 20260827200000_add_active_organization_id,
--     which is timestamped earlier and has already run by the time this file is
--     reached.

-- CreateTable
CREATE TABLE IF NOT EXISTS "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviterId" TEXT NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "member_userId_idx" ON "member"("userId");

-- CreateIndex
-- Serves `@@unique([organizationId, userId])` on Member.
CREATE UNIQUE INDEX IF NOT EXISTS "member_organizationId_userId_key" ON "member"("organizationId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invitation_email_idx" ON "invitation"("email");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "member" ADD CONSTRAINT "member_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;