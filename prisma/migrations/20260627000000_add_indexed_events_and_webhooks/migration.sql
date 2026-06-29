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
CREATE UNIQUE INDEX "IndexedEvent_stellarId_key" ON "IndexedEvent"("stellarId");

-- CreateIndex
CREATE INDEX "IndexedEvent_ledger_idx" ON "IndexedEvent"("ledger");

-- CreateIndex
CREATE INDEX "IndexedEvent_type_idx" ON "IndexedEvent"("type");

-- CreateIndex
CREATE INDEX "IndexedEvent_contractId_idx" ON "IndexedEvent"("contractId");
