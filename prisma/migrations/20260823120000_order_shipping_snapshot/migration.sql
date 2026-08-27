-- AlterTable: shipping rate snapshot on orders
ALTER TABLE "Order" ADD COLUMN "shippingProvider" TEXT,
ADD COLUMN "shippingMode" TEXT,
ADD COLUMN "shippingWeightGrams" INTEGER,
ADD COLUMN "shippingOriginPincode" TEXT,
ADD COLUMN "shippingDestinationPincode" TEXT,
ADD COLUMN "shippingQuotedAt" TIMESTAMP(3);
