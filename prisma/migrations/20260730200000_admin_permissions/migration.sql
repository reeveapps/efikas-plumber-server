-- CreateEnum
CREATE TYPE "AdminPermission" AS ENUM ('MANAGE_ADMINS', 'VIEW_USERS', 'EDIT_USERS', 'BAN_USERS', 'APPROVE_PLUMBER_KYC', 'APPROVE_PARTNER_KYC', 'MODERATE_PRODUCTS', 'MODERATE_CAMPAIGNS', 'MODERATE_TRAINING_CONTENT', 'MANAGE_BILLING_PRICING', 'VIEW_BILLING', 'RESOLVE_CONCERNS', 'VIEW_ANALYTICS', 'SEND_COMMUNICATIONS', 'MANAGE_CMS');

-- AlterTable
ALTER TABLE "AdminProfile" ADD COLUMN     "invitedById" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "permissions" "AdminPermission"[] DEFAULT ARRAY[]::"AdminPermission"[];

-- CreateTable
CREATE TABLE "AdminInvite" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "permissions" "AdminPermission"[],
    "invitedById" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminInvite_token_key" ON "AdminInvite"("token");

-- CreateIndex
CREATE INDEX "AdminInvite_token_idx" ON "AdminInvite"("token");

