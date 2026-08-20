-- AlterTable
ALTER TABLE "Review" ADD COLUMN "authorName" TEXT,
ADD COLUMN "authorLocation" TEXT,
ADD COLUMN "serviceLabel" TEXT,
ADD COLUMN "date" TIMESTAMP(3);