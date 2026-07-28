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

#321 Add a maximum fee cap per settlement
Repo Avatar
Betta-Pay/BettaPay-Backend
Current behavior:
Fee calculation has no upper bound.

Expected behavior:
Add optional maxFeeBps and maxFeeThreshold to merchant settings. In settlement-amounts.ts, if grossAmount > maxFeeThreshold, compute capped fee grossAmount * maxFeeBps / 10000. Use min(uncappedFee, cappedFee). Log when cap is applied.

Files to modify:

services/settlement-engine/src/settlement-amounts.ts
shared/validation/schemas.ts
services/api-gateway/src/index.ts — PATCH merchant settings
Tests: settlement-amounts.test.ts, settlement-amounts.property.test.ts
Test requirements:

Gross $100K, feeBps 1000, maxFeeBps 200, threshold $10K — fee = $2K.
Gross $5K, below threshold — uncapped fee $500.
No maxFee — uncapped.
Property test: fee never exceeds cap when active.
Acceptance criteria:

Settlements have configurable max fee caps.
Optional — merchants without caps use standard fee.

#322 Add retry mechanism for failed settlements
Repo Avatar
Betta-Pay/BettaPay-Backend
Current behavior:
Failed settlements stay failed permanently.

Expected behavior:
Add supersededById to Settlement. Add POST /api/settlements/:id/retry that clones the settlement (same amounts, asset, merchant). Original is marked superseded. Max 3 retries per chain. Listings exclude superseded by default.

Files to modify:

prisma/schema.prisma — add supersededById
New migration
services/settlement-engine/src/index.ts — add retry route
shared/validation/schemas.ts
New test: settlement-retry.test.ts
Test requirements:

Retry failed settlement — new settlement created with same amounts.
Retry completed — 422.
Retry 4 times — 4th attempt returns 422.
Superseded settlements hidden from listing.
Acceptance criteria:

Failed settlements can be retried up to 3 times.
Original settlement linked via supersededById.

