-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'STAFF');

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" "AdminRole" NOT NULL DEFAULT 'ADMIN';
