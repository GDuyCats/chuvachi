-- CreateTable
CREATE TABLE "HomeContent" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "announcementLeftVi" TEXT,
    "announcementLeftEn" TEXT,
    "announcementCenterVi" TEXT,
    "announcementCenterEn" TEXT,
    "announcementRightVi" TEXT,
    "announcementRightEn" TEXT,
    "announcementProductId" INTEGER,
    "heroIsActive" BOOLEAN NOT NULL DEFAULT true,
    "heroEyebrowVi" TEXT,
    "heroEyebrowEn" TEXT,
    "heroTitleVi" TEXT,
    "heroTitleEn" TEXT,
    "heroSubtitleVi" TEXT,
    "heroSubtitleEn" TEXT,
    "heroCtaVi" TEXT,
    "heroCtaEn" TEXT,
    "heroImageUrl" TEXT,
    "heroProductId" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" SERIAL NOT NULL,
    "nameVi" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "eyebrowVi" TEXT,
    "eyebrowEn" TEXT,
    "descriptionVi" TEXT,
    "descriptionEn" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonProduct" (
    "seasonId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SeasonProduct_pkey" PRIMARY KEY ("seasonId","productId")
);

-- CreateTable
CREATE TABLE "ComingSoonItem" (
    "id" SERIAL NOT NULL,
    "dateLabel" TEXT NOT NULL,
    "nameVi" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "noteVi" TEXT,
    "noteEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ComingSoonItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Season_startDate_endDate_idx" ON "Season"("startDate", "endDate");

-- AddForeignKey
ALTER TABLE "HomeContent" ADD CONSTRAINT "HomeContent_announcementProductId_fkey" FOREIGN KEY ("announcementProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeContent" ADD CONSTRAINT "HomeContent_heroProductId_fkey" FOREIGN KEY ("heroProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonProduct" ADD CONSTRAINT "SeasonProduct_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonProduct" ADD CONSTRAINT "SeasonProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
