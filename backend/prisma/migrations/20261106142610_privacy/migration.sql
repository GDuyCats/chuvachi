-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "anonymizedAt" TIMESTAMP(3),
ADD COLUMN     "privacyConsentAt" TIMESTAMP(3),
ADD COLUMN     "privacyPolicyVersion" TEXT;

-- AlterTable
ALTER TABLE "ShopSetting" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "dataRetentionMonths" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "legalAddress" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "registrationNumber" TEXT;
