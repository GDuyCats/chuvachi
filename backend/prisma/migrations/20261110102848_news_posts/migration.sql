-- CreateEnum
CREATE TYPE "PostCategory" AS ENUM ('NEWS', 'NEW_CAKE', 'UPDATE', 'EVENT', 'LETTER');

-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "category" "PostCategory" NOT NULL DEFAULT 'NEWS',
    "titleVi" TEXT NOT NULL,
    "titleEn" TEXT,
    "summaryVi" TEXT,
    "summaryEn" TEXT,
    "bodyVi" TEXT NOT NULL,
    "bodyEn" TEXT,
    "coverImageUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "publishAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");

-- CreateIndex
CREATE INDEX "Post_isPublished_publishAt_idx" ON "Post"("isPublished", "publishAt");
