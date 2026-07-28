-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN "supersededById" TEXT;

-- CreateIndex
CREATE INDEX "Settlement_supersededById_idx" ON "Settlement"("supersededById");

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
