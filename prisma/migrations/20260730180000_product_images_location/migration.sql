-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "locationAddress" TEXT;

