-- CreateTable
CREATE TABLE "CouponUsage" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "profileId" TEXT,
    "customerEmail" TEXT NOT NULL,
    "discountPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponUsage_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "couponDiscount" INTEGER;

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "perCustomerLimit" INTEGER,
ADD COLUMN     "startsAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "CouponUsage_orderId_key" ON "CouponUsage"("orderId");

-- CreateIndex
CREATE INDEX "CouponUsage_couponId_customerEmail_idx" ON "CouponUsage"("couponId", "customerEmail");

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponUsage" ADD CONSTRAINT "CouponUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: coupon usage is never directly reachable by clients (defense in depth)
ALTER TABLE "CouponUsage" ENABLE ROW LEVEL SECURITY;

-- Populate updatedAt for existing rows (default above covers new writes going forward)
UPDATE "Coupon" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
