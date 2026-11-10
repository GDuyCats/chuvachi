-- AlterTable
ALTER TABLE "HomeContent" ADD COLUMN     "heroIntervalSeconds" INTEGER NOT NULL DEFAULT 6;

-- CreateTable
CREATE TABLE "HeroSlide" (
    "id" SERIAL NOT NULL,
    "eyebrowVi" TEXT,
    "eyebrowEn" TEXT,
    "titleVi" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "subtitleVi" TEXT,
    "subtitleEn" TEXT,
    "ctaVi" TEXT,
    "ctaEn" TEXT,
    "imageUrl" TEXT,
    "productId" INTEGER,
    "startDate" DATE,
    "endDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeroSlide_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "HeroSlide" ADD CONSTRAINT "HeroSlide_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
