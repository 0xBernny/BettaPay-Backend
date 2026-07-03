-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('initiated', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "settings" JSONB,
    "secretHash" TEXT,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "payerId" TEXT,
    "amount" DECIMAL(18,6) NOT NULL,
    "asset" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'initiated',
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT,
    "idempotencyKeyExpiresAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "totalAmount" TEXT NOT NULL,
    "grossAmount" TEXT NOT NULL,
    "feeAmount" TEXT NOT NULL,
    "netAmount" TEXT NOT NULL,
    "feeBps" INTEGER NOT NULL,
    "asset" TEXT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'pending',
    "webhookUrl" TEXT,
    "batchId" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexedEvent" (
    "id" TEXT NOT NULL,
    "stellarId" TEXT,
    "contractId" TEXT NOT NULL,
    "topics" TEXT[],
    "type" TEXT NOT NULL,
    "rawValue" TEXT NOT NULL,
    "decodedPayload" JSONB,
    "ledger" INTEGER NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndexedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "IndexedEvent_stellarId_key" ON "IndexedEvent"("stellarId");

-- CreateIndex
CREATE INDEX "IndexedEvent_ledger_idx" ON "IndexedEvent"("ledger");

-- CreateIndex
CREATE INDEX "IndexedEvent_type_idx" ON "IndexedEvent"("type");

-- CreateIndex
CREATE INDEX "IndexedEvent_contractId_idx" ON "IndexedEvent"("contractId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
