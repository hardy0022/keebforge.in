-- Add razorpayPaymentId to Refund for reconciliation when no local Payment exists

ALTER TABLE "Refund" ADD COLUMN "razorpayPaymentId" TEXT;

CREATE INDEX "Refund_razorpayPaymentId_idx" ON "Refund"("razorpayPaymentId");
