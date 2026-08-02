-- AlterTable
ALTER TABLE "Ad" DROP COLUMN "billingModel";

-- DropEnum
DROP TYPE "AdBillingModel";

-- CreateEnum
CREATE TYPE "AdBillingInterval" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- AlterTable
ALTER TABLE "Ad" ADD COLUMN     "billingInterval" "AdBillingInterval" NOT NULL DEFAULT 'MONTHLY';

-- CreateTable
CREATE TABLE "AdPricingRate" (
    "interval" "AdBillingInterval" NOT NULL,
    "priceKes" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdPricingRate_pkey" PRIMARY KEY ("interval")
);
