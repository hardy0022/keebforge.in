-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "razorpayCustomerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Profile_razorpayCustomerId_key" ON "Profile"("razorpayCustomerId");