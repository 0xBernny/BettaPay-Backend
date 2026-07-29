-- AlterTable
ALTER TABLE "Settlement" ADD COLUMN "feeSnapshot" JSONB;

-- Backfill existing settlements with a minimal fee audit snapshot
UPDATE "Settlement" SET "feeSnapshot" = jsonb_build_object(
  'feeBpsApplied', "feeBps",
  'maxFeeBpsApplied', "feeBps",
  'discountApplied', 0,
  'monthlyVolumeAtTime', 0,
  'feeVersion', 'backfill'
) WHERE "feeSnapshot" IS NULL;
