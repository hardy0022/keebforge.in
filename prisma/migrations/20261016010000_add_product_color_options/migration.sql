-- CreateTable
CREATE TABLE "ProductColorOption" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorCode" TEXT NOT NULL,
    "priceAdjustment" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "imagePublicId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductColorOption_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "colorOptionId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "colorCode" TEXT,
ADD COLUMN     "colorName" TEXT,
ADD COLUMN     "colorOptionId" TEXT,
ADD COLUMN     "colorPrice" INTEGER;

-- CreateIndex
CREATE INDEX "ProductColorOption_productId_enabled_sortOrder_idx" ON "ProductColorOption"("productId", "enabled", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProductColorOption" ADD CONSTRAINT "ProductColorOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_colorOptionId_fkey" FOREIGN KEY ("colorOptionId") REFERENCES "ProductColorOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_colorOptionId_fkey" FOREIGN KEY ("colorOptionId") REFERENCES "ProductColorOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
