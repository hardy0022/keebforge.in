-- CreateEnum
CREATE TYPE "ColorOptionGroup" AS ENUM ('BASE', 'SECONDARY');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "secondaryColorHeading" TEXT;

-- AlterTable
ALTER TABLE "ProductColorOption" ADD COLUMN "group" "ColorOptionGroup" NOT NULL DEFAULT 'BASE';

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN "secondaryColorOptionId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem"
ADD COLUMN "secondaryColorOptionId" TEXT,
ADD COLUMN "secondaryColorHeading" TEXT,
ADD COLUMN "secondaryColorName" TEXT,
ADD COLUMN "secondaryColorCode" TEXT,
ADD COLUMN "secondaryColorPrice" INTEGER;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_secondaryColorOptionId_fkey" FOREIGN KEY ("secondaryColorOptionId") REFERENCES "ProductColorOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_secondaryColorOptionId_fkey" FOREIGN KEY ("secondaryColorOptionId") REFERENCES "ProductColorOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
