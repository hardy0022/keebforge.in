-- Razorpay refund accounting.
--
-- Before this, a refund existed only as free text in `OrderTimeline.note` and the
-- only amount the ledger kept was `Payment.amount` (gross collected). Three
-- things were impossible to answer, and one of them caused money to be asked for
-- twice:
--
--   1. How much was actually refunded against a given payment. Recoverable only
--      by reading the note, and notes are display strings.
--   2. Whether a refund had already been processed. Dedupe was
--      `note.contains('(rfnd_X)')`, a substring match, so `rfnd_ABC` matched a
--      note about `rfnd_ABCDEF` and silently dropped a real refund.
--   3. Gross vs net. `Payment.amount` is gross; nothing recorded the return, so
--      "collected" and "retained" were the same number everywhere.
--
-- `Payment.refundedAmount` carries the cumulative return per payment (paise,
-- defaulted to 0 so every existing row backfills to "nothing refunded" without a
-- data migration and without changing any current status). `Refund` is the
-- durable per-refund ledger: one row per `rfnd_…`, with `razorpayRefundId`
-- UNIQUE so the database itself enforces exactly-once refund processing — the
-- text match is no longer load-bearing.
--
-- `paymentId` is nullable with ON DELETE SET NULL because a refund can arrive
-- for a capture this app never recorded; the refund is still real and still
-- tracked, it just has no Payment row to increment.

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('CREATED', 'PROCESSED', 'FAILED');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "refundedAmount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "razorpayRefundId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'CREATED',
    "reasonCode" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- The idempotency key. A redelivered refund.processed resolves to this row.
CREATE UNIQUE INDEX "Refund_razorpayRefundId_key" ON "Refund"("razorpayRefundId");

-- CreateIndex
CREATE INDEX "Refund_orderId_createdAt_idx" ON "Refund"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;