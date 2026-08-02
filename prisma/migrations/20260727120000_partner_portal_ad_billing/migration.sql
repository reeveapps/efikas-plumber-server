-- CreateEnum
CREATE TYPE "AdBillingModel" AS ENUM ('FLAT', 'PER_CLICK', 'PER_IMPRESSION');

-- AlterTable
ALTER TABLE "Ad" ADD COLUMN     "billingAmountKes" INTEGER,
ADD COLUMN     "billingModel" "AdBillingModel" NOT NULL DEFAULT 'FLAT',
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Ad_paymentId_key" ON "Ad"("paymentId");

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

