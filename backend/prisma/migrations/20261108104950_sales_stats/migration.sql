-- AlterTable
ALTER TABLE "ShopSetting" ADD COLUMN     "showSoldCount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "soldCountMinimum" INTEGER NOT NULL DEFAULT 10;
