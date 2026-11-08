-- CreateEnum
CREATE TYPE "CancelReason" AS ENUM ('OUT_OF_INGREDIENTS', 'CANNOT_DELIVER', 'CUSTOMER_REQUEST', 'SHOP_CLOSED', 'UNPAID_TIMEOUT', 'OTHER');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelNote" TEXT,
ADD COLUMN     "cancelReason" "CancelReason";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "dailyLimit" INTEGER,
ADD COLUMN     "soldOutUntil" DATE;

-- AlterTable
ALTER TABLE "ShopSetting" ADD COLUMN     "orderingPaused" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pauseMessageEn" TEXT,
ADD COLUMN     "pauseMessageVi" TEXT;

-- CreateTable
CREATE TABLE "ProductDayBooking" (
    "productId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "bookedPortions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductDayBooking_pkey" PRIMARY KEY ("productId","date")
);

-- AddForeignKey
ALTER TABLE "ProductDayBooking" ADD CONSTRAINT "ProductDayBooking_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
