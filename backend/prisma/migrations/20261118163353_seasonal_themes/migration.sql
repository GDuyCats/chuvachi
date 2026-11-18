-- AlterTable
ALTER TABLE "ShopSetting" ADD COLUMN     "themePinnedId" INTEGER,
ADD COLUMN     "themesOff" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SiteTheme" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "colors" JSONB NOT NULL DEFAULT '{}',
    "messageVi" TEXT,
    "messageEn" TEXT,
    "linkUrl" TEXT,
    "icon" TEXT,
    "iconUrl" TEXT,
    "effect" TEXT NOT NULL DEFAULT 'none',
    "effectOn" BOOLEAN NOT NULL DEFAULT true,
    "effectImageUrl" TEXT,
    "effectAmount" INTEGER NOT NULL DEFAULT 50,
    "effectSpeed" INTEGER NOT NULL DEFAULT 50,
    "effectSize" INTEGER NOT NULL DEFAULT 50,
    "effectAllPages" BOOLEAN NOT NULL DEFAULT false,
    "scheduleOn" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATE,
    "endDate" DATE,
    "yearly" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteTheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminSession_adminUserId_idx" ON "AdminSession"("adminUserId");

-- CreateIndex
CREATE INDEX "CustomerSession_customerId_idx" ON "CustomerSession"("customerId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "PostComment_customerId_idx" ON "PostComment"("customerId");

-- CreateIndex
CREATE INDEX "PostCommentReport_commentId_idx" ON "PostCommentReport"("commentId");

-- CreateIndex
CREATE INDEX "ProductOption_productId_idx" ON "ProductOption"("productId");

-- CreateIndex
CREATE INDEX "RecipeLine_recipeId_idx" ON "RecipeLine"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeLine_ingredientId_idx" ON "RecipeLine"("ingredientId");

-- CreateIndex
CREATE INDEX "Review_customerId_idx" ON "Review"("customerId");

-- CreateIndex
CREATE INDEX "ReviewComment_customerId_idx" ON "ReviewComment"("customerId");

-- CreateIndex
CREATE INDEX "ReviewReport_reviewId_idx" ON "ReviewReport"("reviewId");

-- CreateIndex
CREATE INDEX "ReviewReport_commentId_idx" ON "ReviewReport"("commentId");

-- CreateIndex
CREATE INDEX "ReviewVote_reviewId_idx" ON "ReviewVote"("reviewId");

-- CreateIndex
CREATE INDEX "ReviewVote_commentId_idx" ON "ReviewVote"("commentId");
