# fix: settlement batching and dynamic supported assets (#319, #320)

Closes #319, Closes #320

## Summary

- **#319** — Added `SupportedAsset` model with admin CRUD endpoints (`GET /api/assets`, `POST /admin/assets`, `PATCH /admin/assets/:code`, `DELETE /admin/assets/:code`). Settlement creation now validates assets against this table, returning 422 for unsupported/inactive assets. Initial seed includes USDC, EURT, and XLMS.
- **#320** — Implemented settlement batching via BullMQ repeatable job. Job runs every `BATCH_INTERVAL_SECONDS` (default 300s), queries pending settlements, groups by asset, and creates `SettlementBatch` records for assets with ≥ `BATCH_MIN_COUNT` settlements (default 2). Individual settlements are linked via `batchId` and marked completed. Includes comprehensive tests.

## Files changed

**Schema & Migrations:**
- `prisma/schema.prisma` — added `SupportedAsset` and `SettlementBatch` models
- `prisma/migrations/20260728110538_add_supported_assets_and_batching/migration.sql` — migration with seed data

**Backend Services:**
- `services/settlement-engine/src/index.ts` — BullMQ repeatable batching job, graceful shutdown updates
- `services/api-gateway/src/index.ts` — asset validation in settlement creation, new `/api/assets` and admin CRUD routes
- `services/settlement-engine/src/settlement-batching.test.ts` — test suite for batching logic

**Shared Libraries:**
- `shared/validation/index.ts` — added `BATCH_INTERVAL_SECONDS` and `BATCH_MIN_COUNT` env vars
- `shared/validation/schemas.ts` — added `SupportedAssetSchema`, `CreateSupportedAssetBody`, `UpdateSupportedAssetBody`

## Test Coverage

**#319 - Supported Assets:**
- ✅ GET /api/assets returns seeded assets
- ✅ Settlement creation with unsupported asset returns 422
- ✅ Admin can add/update/delete assets

**#320 - Settlement Batching:**
- ✅ 2 USDC + 1 EURT pending → USDC batch created, EURT stays pending
- ✅ 1 pending settlement → no batch (below min count)
- ✅ 0 pending settlements → no batches created

## Deployment Notes

- Run migration: `npx prisma migrate deploy`
- Configure env vars: `BATCH_INTERVAL_SECONDS`, `BATCH_MIN_COUNT`
- Initial assets seeded automatically (USDC, EURT, XLMS)
