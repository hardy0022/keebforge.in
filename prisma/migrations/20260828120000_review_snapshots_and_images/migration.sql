-- KeebForge review system: product-context snapshots (survive product
-- deletion), updatedAt, one-review-per-customer-per-product, and REVIEW
-- media entity type for customer review photos.

-- ── Review: new fields ────────────────────────────────────────────────────

ALTER TABLE "Review" ADD COLUMN "productNameSnapshot" TEXT;
ALTER TABLE "Review" ADD COLUMN "productSlugSnapshot" TEXT;
ALTER TABLE "Review" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill snapshots from the live product so historical product reviews keep
-- their context even if the product row is deleted later.
UPDATE "Review" r
SET "productNameSnapshot" = p.name,
    "productSlugSnapshot" = p.slug
FROM "Product" p
WHERE r."productId" = p.id;

-- Defensive dedupe before the uniqueness applies: keep the newest review per
-- (customer, product). PostgreSQL treats NULLs as distinct, so orphaned
-- (productId = NULL) and service (profileId/productId variant) rows are safe.
DELETE FROM "Review"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id",
           ROW_NUMBER() OVER (
             PARTITION BY "profileId", "productId"
             ORDER BY "createdAt" DESC, "id"
           ) AS rn
    FROM "Review"
    WHERE "productId" IS NOT NULL AND "profileId" IS NOT NULL
  ) t
  WHERE t.rn > 1
);

-- One written review per customer per product (NULLs stay distinct).
CREATE UNIQUE INDEX "review_profileId_productId_key" ON "Review"("profileId", "productId");

-- ── Media entity type: REVIEW ──────────────────────────────────────────────

-- Postgres enums can't be altered in place; recreate the type with the added
-- value (Prisma's standard pattern).
CREATE TYPE "MediaEntityType_new" AS ENUM ('REPAIR', 'ORDER', 'SERVICE', 'REVIEW');
ALTER TABLE "Media" ALTER COLUMN "entityType" TYPE "MediaEntityType_new" USING ("entityType"::text::"MediaEntityType_new");
DROP TYPE "MediaEntityType";
ALTER TYPE "MediaEntityType_new" RENAME TO "MediaEntityType";