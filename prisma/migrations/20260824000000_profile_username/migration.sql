-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Profile_username_key" ON "Profile"("username");
