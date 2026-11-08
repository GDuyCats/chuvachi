-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('AVAILABLE', 'SOLD_OUT', 'COMING_SOON');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "availability" "Availability" NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE "ProductOption" ADD COLUMN     "availability" "Availability" NOT NULL DEFAULT 'AVAILABLE';
