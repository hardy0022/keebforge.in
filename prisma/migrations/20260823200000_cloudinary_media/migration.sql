-- Cloudinary media management
ALTER TABLE "ProductImage" ADD COLUMN "publicId" TEXT;

CREATE TYPE "MediaEntityType" AS ENUM ('REPAIR', 'ORDER', 'SERVICE');
CREATE TYPE "MediaRole" AS ENUM ('BEFORE', 'AFTER', 'DIAGNOSTIC', 'WORK', 'FINAL', 'CUSTOMER_UPLOAD', 'OTHER');

CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "secureUrl" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL DEFAULT 'image',
    "entityType" "MediaEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "role" "MediaRole" NOT NULL DEFAULT 'OTHER',
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Media_publicId_key" ON "Media"("publicId");
CREATE INDEX "Media_entityType_entityId_role_idx" ON "Media"("entityType", "entityId", "role");
