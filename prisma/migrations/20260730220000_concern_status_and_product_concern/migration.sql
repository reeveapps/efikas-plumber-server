-- CreateEnum
CREATE TYPE "ConcernStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED_CUSTOMER', 'RESOLVED_OTHER_PARTY', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ProductConcernReason" AS ENUM ('ITEM_NOT_AS_DESCRIBED', 'NOT_DELIVERED', 'MISLEADING_AD', 'OVERCHARGED', 'POOR_SUPPLIER_CONDUCT', 'OTHER');

-- AlterTable
ALTER TABLE "Dispute" DROP COLUMN "status",
ADD COLUMN     "status" "ConcernStatus" NOT NULL DEFAULT 'OPEN';

-- DropEnum
DROP TYPE "DisputeStatus";

-- CreateTable
CREATE TABLE "ProductConcern" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "deliveryRequestId" TEXT,
    "reporterId" TEXT NOT NULL,
    "reporterRole" "Role" NOT NULL,
    "reason" "ProductConcernReason" NOT NULL,
    "description" TEXT NOT NULL,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ConcernStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductConcern_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductConcern_status_idx" ON "ProductConcern"("status");

-- CreateIndex
CREATE INDEX "ProductConcern_productId_idx" ON "ProductConcern"("productId");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- AddForeignKey
ALTER TABLE "ProductConcern" ADD CONSTRAINT "ProductConcern_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductConcern" ADD CONSTRAINT "ProductConcern_deliveryRequestId_fkey" FOREIGN KEY ("deliveryRequestId") REFERENCES "DeliveryRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

