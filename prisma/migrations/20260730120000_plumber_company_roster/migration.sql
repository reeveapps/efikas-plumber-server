-- AlterTable
ALTER TABLE "PlumberProfile" ADD COLUMN     "accountType" "PlumberAccountType" NOT NULL DEFAULT 'INDIVIDUAL',
ADD COLUMN     "businessRegNumber" TEXT,
ADD COLUMN     "companyOwnerId" TEXT;

-- AddForeignKey
ALTER TABLE "PlumberProfile" ADD CONSTRAINT "PlumberProfile_companyOwnerId_fkey" FOREIGN KEY ("companyOwnerId") REFERENCES "PlumberProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

