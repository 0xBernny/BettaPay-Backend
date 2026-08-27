# fix: settlement batching, supported assets, fee caps, and retry mechanism (#319, #320, #321, #322)

Closes #319, Closes #320, Closes #321, Closes #322

## Summary

- **#319** — Added `SupportedAsset` model with admin CRUD endpoints (`GET /api/assets`, `POST /admin/assets`, `PATCH /admin/assets/:code`, `DELETE /admin/assets/:code`). Settlement creation now validates assets against this table, returning 422 for unsupported/inactive assets. Initial seed includes USDC, EURT, and XLMS.
- **#320** — Implemented settlement batching via BullMQ repeatable job. Job runs every `BATCH_INTERVAL_SECONDS` (default 300s), queries pending settlements, groups by asset, and creates `SettlementBatch` records for assets with ≥ `BATCH_MIN_COUNT` settlements (default 2). Individual settlements are linked via `batchId` and marked completed.
- **#321** — Added maximum fee cap support. Merchants can configure `maxFeeBps` and `maxFeeThreshold` in settings. When `grossAmount > maxFeeThreshold`, fee is capped at `grossAmount * maxFeeBps / 10000`. Logs when cap is applied. Fee audit snapshot includes `capApplied` flag and `uncappedFee`.
- **#322** — Implemented retry mechanism for failed settlements. Added `POST /api/settlements/:id/retry` endpoint that clones failed settlements with same amounts/asset/merchant. Original marked as superseded via `supersededById`. Max 3 retries enforced per chain. Superseded settlements excluded from default listings.

## Files changed

**Schema & Migrations:**
- `prisma/schema.prisma` — added `SupportedAsset`, `SettlementBatch` models, `supersededById` field to Settlement
- `prisma/migrations/20260728110538_add_supported_assets_and_batching/migration.sql` — migration with seed data
- `prisma/migrations/20260728111000_add_settlement_retry/migration.sql` — migration for retry mechanism

**Backend Services:**
- `services/settlement-engine/src/index.ts` — batching job, retry route, fee cap support, listing filters
- `services/settlement-engine/src/settlement-amounts.ts` — FeeConfig interface, cap logic with audit trail
- `services/api-gateway/src/index.ts` — asset validation, new asset CRUD routes

**Test Files:**
- `services/settlement-engine/src/settlement-batching.test.ts` — batching test suite
- `services/settlement-engine/src/settlement-retry.test.ts` — retry test suite

**Shared Libraries:**
- `shared/validation/index.ts` — added `BATCH_INTERVAL_SECONDS`, `BATCH_MIN_COUNT` env vars
- `shared/validation/schemas.ts` — `SupportedAsset` schemas, `maxFeeBps`, `maxFeeThreshold` in MerchantSettings

## Test Coverage

**#319 - Supported Assets:**
- ✅ GET /api/assets returns seeded assets
- ✅ Settlement creation with unsupported asset returns 422
- ✅ Admin can add/update/delete assets

**#320 - Settlement Batching:**
- ✅ 2 USDC + 1 EURT pending → USDC batch created, EURT stays pending
- ✅ 1 pending settlement → no batch (below min count)
- ✅ 0 pending settlements → no batches created

**#321 - Fee Caps:**
- ✅ Gross $100K, feeBps 1000, maxFeeBps 200, threshold $10K → fee = $2K (capped)
- ✅ Gross $5K below threshold → uncapped fee $500
- ✅ No maxFee configured → uncapped behavior
- ✅ Fee audit snapshot tracks cap application

**#322 - Retry Mechanism:**
- ✅ Retry failed settlement → new settlement created
- ✅ Retry completed settlement → 422 error
- ✅ Max 3 retries enforced per chain
- ✅ Superseded settlements hidden from default listing

## Deployment Notes

- Run migrations: `npx prisma migrate deploy`
- Configure env vars: `BATCH_INTERVAL_SECONDS`, `BATCH_MIN_COUNT`
- Initial assets seeded automatically (USDC, EURT, XLMS)
- Merchants can configure fee caps via PATCH /api/merchants/:id/settings
- Failed settlements can be retried via POST /api/settlements/:id/retry
