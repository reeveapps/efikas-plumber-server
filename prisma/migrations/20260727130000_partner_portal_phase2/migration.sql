-- CreateEnum
CREATE TYPE "TrainingContentStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TrainingCategory" AS ENUM ('SAFETY', 'TECHNIQUES', 'CUSTOMER_SERVICE', 'BUSINESS');

-- AlterTable
ALTER TABLE "PartnerProfile" ADD COLUMN     "logoUrl" TEXT;

-- CreateTable
CREATE TABLE "AdEvent" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userRole" "Role",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingContent" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT,
    "createdByAdminId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "TrainingCategory" NOT NULL,
    "videoUrl" TEXT,
    "videoFileUrl" TEXT,
    "guidePdfUrl" TEXT,
    "downloadable" BOOLEAN NOT NULL DEFAULT false,
    "status" "TrainingContentStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "rejectionReason" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingContent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdEvent_adId_type_createdAt_idx" ON "AdEvent"("adId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "TrainingContent_status_idx" ON "TrainingContent"("status");

-- CreateIndex
CREATE INDEX "TrainingContent_category_idx" ON "TrainingContent"("category");

-- AddForeignKey
ALTER TABLE "AdEvent" ADD CONSTRAINT "AdEvent_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingContent" ADD CONSTRAINT "TrainingContent_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "PartnerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

