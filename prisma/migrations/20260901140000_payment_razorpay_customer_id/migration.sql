-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "razorpayCustomerId" TEXT;

-- CreateIndex
CREATE INDEX "Payment_razorpayCustomerId_idx" ON "Payment"("razorpayCustomerId");