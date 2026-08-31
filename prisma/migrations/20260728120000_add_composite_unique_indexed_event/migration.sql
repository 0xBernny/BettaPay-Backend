-- DropIndex
DROP INDEX "IndexedEvent_stellarId_key";

-- CreateIndex
CREATE UNIQUE INDEX "IndexedEvent_stellarId_contractId_ledger_key" ON "IndexedEvent"("stellarId", "contractId", "ledger");
