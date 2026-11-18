-- AlterTable
ALTER TABLE "ShopSetting" ADD COLUMN     "themePinnedAt" DATE;

-- AlterTable
ALTER TABLE "SiteTheme" ADD COLUMN     "effectImages" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "effectPieces" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "effectSizeMix" INTEGER NOT NULL DEFAULT 40;
