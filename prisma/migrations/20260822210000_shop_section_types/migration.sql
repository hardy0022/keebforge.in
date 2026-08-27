-- Shop section types + product condition
CREATE TYPE "ShopSectionType" AS ENUM ('CUSTOM', 'NEW', 'CLEARANCE');
CREATE TYPE "ProductCondition" AS ENUM ('NEW', 'OPEN_BOX', 'USED', 'REFURBISHED', 'DISPLAY', 'CLEARANCE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "productType" "ShopSectionType" NOT NULL DEFAULT 'NEW';
ALTER TABLE "Product" ADD COLUMN "condition" "ProductCondition";

-- Existing out-of-stock / archived inventory becomes clearance stock; everything else stays NEW
UPDATE "Product" SET "condition" = 'CLEARANCE', "productType" = 'CLEARANCE' WHERE status = 'OUT_OF_STOCK';
UPDATE "Product" SET "condition" = 'USED', "productType" = 'CLEARANCE' WHERE status = 'ARCHIVED';
