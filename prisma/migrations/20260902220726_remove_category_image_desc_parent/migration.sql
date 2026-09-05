-- DropIndex
DROP INDEX "Category_parentId_idx";

-- AlterTable
ALTER TABLE "Category" DROP COLUMN "description",
DROP COLUMN "image",
DROP COLUMN "parentId";
