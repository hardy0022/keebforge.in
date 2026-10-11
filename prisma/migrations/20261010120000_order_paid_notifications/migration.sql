-- Durable outbox for transactional order notifications (paid-order confirmations).
--
-- The confirmation email must be sent exactly once per order when the order
-- becomes fully paid, and the two settlement paths — POST /api/payments/verify
-- (browser return) and POST /api/payments/webhook (Razorpay capture) — can both
-- observe the same full settlement. The unique key on (orderId, type) is the
-- database-level guard: only one row can exist per order/type, and a conditional
-- claim on status = PENDING lets only one of the racing requests move it to
-- IN_PROGRESS. That makes "at most one automatic send attempt" a database
-- guarantee instead of an in-process assumption.
--
-- The row is intentionally NOT part of the payment settlement transaction: email
-- delivery state and money state must be able to disagree, so a Resend failure
-- can never roll back a successful capture.
--
-- Lifecycle: PENDING -> IN_PROGRESS -> SENT | FAILED | NEEDS_REVIEW.
--   FAILED       = Resend returned a definitive rejection (safe to retry).
--   NEEDS_REVIEW = ambiguous outcome (timeout/network/5xx); never auto-retried.

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PAID_CONFIRMATION');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SENT', 'FAILED', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "OrderNotification" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'PAID_CONFIRMATION',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderNotification_orderId_type_key" ON "OrderNotification"("orderId", "type");

-- CreateIndex
CREATE INDEX "OrderNotification_status_idx" ON "OrderNotification"("status");

-- CreateIndex
CREATE INDEX "OrderNotification_orderId_idx" ON "OrderNotification"("orderId");

-- AddForeignKey
ALTER TABLE "OrderNotification" ADD CONSTRAINT "OrderNotification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
