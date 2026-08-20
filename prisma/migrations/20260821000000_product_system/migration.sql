-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'OUT_OF_STOCK', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProductType" ADD VALUE 'BAREBONES';
ALTER TYPE "ProductType" ADD VALUE 'PLATE';
ALTER TYPE "ProductType" ADD VALUE 'SPRING';
ALTER TYPE "ProductType" ADD VALUE 'SWITCH_FILM';
ALTER TYPE "ProductType" ADD VALUE 'LUBRICANT';
ALTER TYPE "ProductType" ADD VALUE 'DESK_MAT';
ALTER TYPE "ProductType" ADD VALUE 'MOUSE_SWITCH';
ALTER TYPE "ProductType" ADD VALUE 'MOUSE_SKATE';
ALTER TYPE "ProductType" ADD VALUE 'ENCODER';
ALTER TYPE "ProductType" ADD VALUE 'TOOL';
ALTER TYPE "ProductType" ADD VALUE 'FOAM';
ALTER TYPE "ProductType" ADD VALUE 'MOD_ACCESSORY';
ALTER TYPE "ProductType" ADD VALUE 'DIY_KIT';

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "image" TEXT,
ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "profileId" TEXT,
ADD COLUMN     "variantId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "discount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tax" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "allowBackorders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "canonicalUrl" TEXT,
ADD COLUMN     "costPrice" INTEGER,
ADD COLUMN     "features" JSONB,
ADD COLUMN     "freeShipping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gstRate" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "heightCm" DOUBLE PRECISION,
ADD COLUMN     "inventoryTracking" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isNew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lengthCm" DOUBLE PRECISION,
ADD COLUMN     "ogImageUrl" TEXT,
ADD COLUMN     "popular" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ratingAverage" DOUBLE PRECISION,
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "seoKeywords" TEXT,
ADD COLUMN     "shippingClass" TEXT,
ADD COLUMN     "shippingInfo" TEXT,
ADD COLUMN     "shippingRestrictions" TEXT,
ADD COLUMN     "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "warrantyInfo" TEXT,
ADD COLUMN     "weight" INTEGER,
ADD COLUMN     "whatsIncluded" JSONB,
ADD COLUMN     "widthCm" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "variantId" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "weight" INTEGER;

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_variantId_createdAt_idx" ON "InventoryMovement"("productId", "variantId", "createdAt");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_status_active_idx" ON "Product"("status", "active");

-- CreateIndex
CREATE INDEX "Product_createdAt_idx" ON "Product"("createdAt");

-- CreateIndex
CREATE INDEX "ProductImage_productId_variantId_idx" ON "ProductImage"("productId", "variantId");

-- CreateIndex
CREATE INDEX "ProductVariant_sku_idx" ON "ProductVariant"("sku");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

