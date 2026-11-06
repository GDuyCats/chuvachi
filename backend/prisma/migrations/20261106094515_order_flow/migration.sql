/*
  Warnings:

  - The values [DELIVERING] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [COD] on the enum `PaymentMethod` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `fee` on the `DeliveryZone` table. All the data in the column will be lost.
  - You are about to drop the column `shippingFee` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `subtotal` on the `Order` table. All the data in the column will be lost.
  - Added the required column `deliveryType` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('ASAP', 'SCHEDULED');

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');
ALTER TABLE "public"."Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentMethod_new" AS ENUM ('BANK_TRANSFER');
ALTER TABLE "Order" ALTER COLUMN "paymentMethod" TYPE "PaymentMethod_new" USING ("paymentMethod"::text::"PaymentMethod_new");
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
DROP TYPE "public"."PaymentMethod_old";
COMMIT;

-- AlterTable
ALTER TABLE "DeliveryZone" DROP COLUMN "fee";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "shippingFee",
DROP COLUMN "subtotal",
ADD COLUMN     "deliveryType" "DeliveryType" NOT NULL,
ALTER COLUMN "deliverySlot" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ShopSetting" ADD COLUMN     "closeTime" TEXT NOT NULL DEFAULT '20:00',
ADD COLUMN     "openTime" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "unpaidCancelMinutes" INTEGER NOT NULL DEFAULT 30;
