-- Add index on Settlement.initiatedAt for pagination performance (#230)
CREATE INDEX "Settlement_initiatedAt_idx" ON "Settlement"("initiatedAt" DESC);

-- Add composite index on (merchantId, initiatedAt) for filtered queries (#234)
CREATE INDEX "Settlement_merchantId_initiatedAt_idx" ON "Settlement"("merchantId", "initiatedAt" DESC);
