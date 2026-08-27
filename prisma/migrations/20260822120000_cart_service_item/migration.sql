-- CreateTable
CREATE TABLE "CartServiceItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartServiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CartServiceItem_cartId_key" ON "CartServiceItem"("cartId");

-- AddForeignKey
ALTER TABLE "CartServiceItem" ADD CONSTRAINT "CartServiceItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

