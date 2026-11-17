-- AlterTable
ALTER TABLE "HeroSlide" ADD COLUMN     "imageSide" TEXT NOT NULL DEFAULT 'right',
ADD COLUMN     "splitAlign" TEXT NOT NULL DEFAULT 'spread',
ADD COLUMN     "splitGap" INTEGER NOT NULL DEFAULT 4;

-- AlterTable
ALTER TABLE "HomeContent" ADD COLUMN     "heroImageSide" TEXT NOT NULL DEFAULT 'right',
ADD COLUMN     "heroSplitAlign" TEXT NOT NULL DEFAULT 'spread',
ADD COLUMN     "heroSplitGap" INTEGER NOT NULL DEFAULT 4;
