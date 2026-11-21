-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "newCakeAlerts" BOOLEAN;

-- AlterTable
ALTER TABLE "CustomerPushSubscription" ADD COLUMN     "newCakeAlerts" BOOLEAN;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "announced" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Favorite" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "customerId" INTEGER,
    "subscriptionId" INTEGER,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Favorite_productId_idx" ON "Favorite"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_customerId_productId_key" ON "Favorite"("customerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_subscriptionId_productId_key" ON "Favorite"("subscriptionId", "productId");

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CustomerPushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
