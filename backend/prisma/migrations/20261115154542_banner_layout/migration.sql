-- AlterTable
ALTER TABLE "HeroSlide" ADD COLUMN     "focusX" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "focusY" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "textAlign" TEXT NOT NULL DEFAULT 'left',
ADD COLUMN     "textOverlay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "textPosition" TEXT NOT NULL DEFAULT 'middle-left',
ADD COLUMN     "textPositionMobile" TEXT;

-- AlterTable
ALTER TABLE "HomeContent" ADD COLUMN     "heroFocusX" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "heroFocusY" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "heroTextAlign" TEXT NOT NULL DEFAULT 'left',
ADD COLUMN     "heroTextOverlay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "heroTextPosition" TEXT NOT NULL DEFAULT 'middle-left',
ADD COLUMN     "heroTextPositionMobile" TEXT;
