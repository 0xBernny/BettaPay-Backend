# Issues Fixed

## #320 Implement settlement batching across multiple merchants into single on-chain transactions ✅

**Status:** FIXED

Current behavior:
Each settlement processed individually. Small settlements may be uneconomical due to network fees.

Expected behavior:
Add SettlementBatch model. BullMQ repeatable job runs every BATCH_INTERVAL_SECONDS (default 300). Queries pending settlements, groups by asset. Creates a batch for groups with ≥ BATCH_MIN_COUNT settlements. Updates each settlement's batchId. Marks as completed. Settlements below min count remain pending.

**Implementation:**

Files modified:
- `prisma/schema.prisma` — added SettlementBatch model
- `prisma/migrations/20260728110538_add_supported_assets_and_batching/migration.sql` — migration for SettlementBatch
- `services/settlement-engine/src/index.ts` — added BullMQ repeatable job for batching
- `shared/validation/index.ts` — added BATCH_INTERVAL_SECONDS and BATCH_MIN_COUNT env vars
- `services/settlement-engine/src/settlement-batching.test.ts` — comprehensive tests

Test coverage:
✅ 3 pending (2 USDC, 1 EURT) — USDC batch created with 2, EURT stays pending
✅ 1 pending — no batch (below min count)
✅ 0 pending — no batches

Acceptance criteria met:
✅ Pending settlements batched by asset at configurable intervals
✅ Batch records accurately reflect totals

---

## #319 Add dynamic supported-assets endpoint with database-backed configuration ✅

**Status:** FIXED

Current behavior:
GET /api/currencies returns codes only (no contract IDs). Settlement creation accepts any asset without validation.

Expected behavior:
Add SupportedAsset table (code, contractId, decimals, name, isActive). Seed with initial values. Add GET /api/assets. Validate settlement asset field against this table. Add admin CRUD endpoints. Cache in Redis (1h TTL).

**Implementation:**

Files modified:
- `prisma/schema.prisma` — added SupportedAsset model
- `prisma/migrations/20260728110538_add_supported_assets_and_batching/migration.sql` — migration with seed data (USDC, EURT, XLMS)
- `services/api-gateway/src/index.ts` — added routes and settlement validation
- `shared/validation/schemas.ts` — added SupportedAsset schemas

New endpoints:
- `GET /api/assets` — list all active supported assets
- `POST /api/admin/assets` — admin: add new asset
- `PATCH /api/admin/assets/:code` — admin: update asset
- `DELETE /api/admin/assets/:code` — admin: delete asset

Validation:
✅ Settlement creation validates asset against SupportedAsset table
✅ Returns 422 for unsupported or inactive assets

Acceptance criteria met:
✅ Supported assets are dynamically configurable
✅ Settlement asset validated against the list
✅ Admin CRUD endpoints functional

---

## #321 Add a maximum fee cap per settlement ✅

**Status:** FIXED

Current behavior:
Fee calculation has no upper bound.

Expected behavior:
Add optional maxFeeBps and maxFeeThreshold to merchant settings. In settlement-amounts.ts, if grossAmount > maxFeeThreshold, compute capped fee grossAmount * maxFeeBps / 10000. Use min(uncappedFee, cappedFee). Log when cap is applied.

**Implementation:**

Files modified:
- `services/settlement-engine/src/settlement-amounts.ts` — added FeeConfig interface with maxFeeBps and maxFeeThreshold, updated computeSettlementAmounts to apply cap
- `shared/validation/schemas.ts` — added maxFeeBps and maxFeeThreshold to MerchantSettings and UpdateMerchantSettingsBody
- `services/settlement-engine/src/index.ts` — pass fee config to computeSettlementAmounts, log when cap is applied

Fee logic:
- When grossAmount > maxFeeThreshold, compute cappedFee = grossAmount * maxFeeBps / 10000
- Final fee = min(uncappedFee, cappedFee)
- FeeAuditSnapshot includes capApplied flag and uncappedFee when cap is triggered

Test coverage:
✅ Gross $100K, feeBps 1000, maxFeeBps 200, threshold $10K — fee = $2K (capped)
✅ Gross $5K, below threshold — uncapped fee $500
✅ No maxFee — uncapped behavior
✅ Fee never exceeds cap when active (property test compatible)

Acceptance criteria met:
✅ Settlements have configurable max fee caps
✅ Merchants without caps use standard fee calculation

---

## #322 Add retry mechanism for failed settlements ✅

**Status:** FIXED

Current behavior:
Failed settlements stay failed permanently.

Expected behavior:
Add supersededById to Settlement. Add POST /api/settlements/:id/retry that clones the settlement (same amounts, asset, merchant). Original is marked superseded. Max 3 retries per chain. Listings exclude superseded by default.

**Implementation:**

Files modified:
- `prisma/schema.prisma` — added supersededById field with self-referencing relation
- `prisma/migrations/20260728111000_add_settlement_retry/migration.sql` — migration for retry mechanism
- `services/settlement-engine/src/index.ts` — added POST /api/settlements/:id/retry route, updated listing to exclude superseded by default
- `services/settlement-engine/src/settlement-retry.test.ts` — comprehensive test suite

Retry logic:
- Only failed settlements can be retried
- Creates new settlement with same amounts, asset, and merchant
- Original settlement linked via supersededById
- Enforces max 3 retries per chain
- New settlement queued for processing

Test coverage:
✅ Retry failed settlement — new settlement created with same amounts
✅ Retry completed — 422 error
✅ Retry 4 times — 4th attempt returns 422
✅ Superseded settlements hidden from listing by default

Acceptance criteria met:
✅ Failed settlements can be retried up to 3 times
✅ Original settlement linked via supersededById
✅ Superseded settlements excluded from default listings

