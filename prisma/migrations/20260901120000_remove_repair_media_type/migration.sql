-- Remove repair-image feature: drop REPAIR media rows, then the enum value.
-- Postgres has no DROP VALUE; recreate the enum without REPAIR instead.
DELETE FROM "Media" WHERE "entityType" = 'REPAIR';

ALTER TYPE "MediaEntityType" RENAME TO "MediaEntityType_old";
CREATE TYPE "MediaEntityType" AS ENUM ('ORDER', 'SERVICE', 'REVIEW');
ALTER TABLE "Media" ALTER COLUMN "entityType" TYPE "MediaEntityType" USING ("entityType"::text::"MediaEntityType");
DROP TYPE "MediaEntityType_old";
