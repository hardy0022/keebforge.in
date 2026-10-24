-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "addonDescription" TEXT,
ADD COLUMN     "addonEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "addonPrice" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "addonTitle" TEXT;

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "addonSelected" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "addonDescription" TEXT,
ADD COLUMN     "addonPrice" INTEGER,
ADD COLUMN     "addonSelected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "addonTitle" TEXT;
