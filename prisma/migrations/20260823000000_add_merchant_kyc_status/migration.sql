-- Add KYC status to merchants. Existing rows default to 'unverified'.
-- The Prisma schema declares KycStatus as an enum and the Merchant model
-- references it via `kycStatus KycStatus @default(unverified)`, but no
-- migration was generated for it, causing CI seed failures with the
-- Prisma 7.9 driver adapter.

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('unverified', 'pending', 'verified', 'rejected');

-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN "kycStatus" "KycStatus" NOT NULL DEFAULT 'unverified';