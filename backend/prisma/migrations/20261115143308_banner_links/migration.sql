-- AlterTable
ALTER TABLE "HeroSlide" ADD COLUMN     "imageOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "linkUrl" TEXT;

-- AlterTable
ALTER TABLE "HomeContent" ADD COLUMN     "heroImageOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "heroLinkUrl" TEXT;
