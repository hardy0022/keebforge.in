-- Payment integrity: unique Razorpay payment IDs (webhook idempotency),
-- failure tracking, and updatedAt bookkeeping.

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "failureReason" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_razorpayPaymentId_key" ON "Payment"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "Payment_razorpayPaymentId_idx" ON "Payment"("razorpayPaymentId");

-- Align with Prisma's expected schema (default only existed to backfill existing rows).
ALTER TABLE "Payment" ALTER COLUMN "updatedAt" DROP DEFAULT;
