-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerEditCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "customerEditedAt" TIMESTAMP(3);
