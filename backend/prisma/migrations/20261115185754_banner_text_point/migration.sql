/*
  Warnings:

  - You are about to drop the column `textPosition` on the `HeroSlide` table. All the data in the column will be lost.
  - You are about to drop the column `textPositionMobile` on the `HeroSlide` table. All the data in the column will be lost.
  - You are about to drop the column `heroTextPosition` on the `HomeContent` table. All the data in the column will be lost.
  - You are about to drop the column `heroTextPositionMobile` on the `HomeContent` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "HeroSlide" DROP COLUMN "textPosition",
DROP COLUMN "textPositionMobile",
ADD COLUMN     "textX" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "textXMobile" INTEGER,
ADD COLUMN     "textY" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "textYMobile" INTEGER;

-- AlterTable
ALTER TABLE "HomeContent" DROP COLUMN "heroTextPosition",
DROP COLUMN "heroTextPositionMobile",
ADD COLUMN     "heroTextX" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "heroTextXMobile" INTEGER,
ADD COLUMN     "heroTextY" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "heroTextYMobile" INTEGER;
