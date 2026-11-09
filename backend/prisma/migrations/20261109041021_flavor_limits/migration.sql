-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "flavorOptionId" INTEGER;

-- AlterTable
ALTER TABLE "ProductOption" ADD COLUMN     "dailyLimit" INTEGER;

-- CreateTable
CREATE TABLE "ProductOptionDayBooking" (
    "optionId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "bookedPortions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductOptionDayBooking_pkey" PRIMARY KEY ("optionId","date")
);

-- AddForeignKey
ALTER TABLE "ProductOptionDayBooking" ADD CONSTRAINT "ProductOptionDayBooking_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "ProductOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
