-- DropForeignKey
ALTER TABLE "Service" DROP CONSTRAINT "Service_groupId_fkey";

-- DropForeignKey
ALTER TABLE "OrderService" DROP CONSTRAINT "OrderService_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "CartServiceItem" DROP CONSTRAINT "CartServiceItem_cartId_fkey";

-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_serviceId_fkey";

-- DropIndex
DROP INDEX "Review_serviceId_status_idx";

-- AlterTable
ALTER TABLE "OrderService" DROP COLUMN "serviceId";

-- AlterTable
ALTER TABLE "Review" DROP COLUMN "serviceId";

-- DropTable
DROP TABLE "Service";

-- DropTable
DROP TABLE "CartServiceItem";

