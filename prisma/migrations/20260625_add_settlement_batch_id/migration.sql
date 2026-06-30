-- Add batchId to Settlement for multi-asset batch settlement support
ALTER TABLE "Settlement" ADD COLUMN "batchId" TEXT;
