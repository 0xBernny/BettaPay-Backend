Current behavior:
Soft-deleting a merchant leaves their payments and settlements active.

Expected behavior:
When merchant is soft-deleted, use a transaction to cancel initiated payments and fail pending settlements. Add audit log entries for each cascaded change. Best-effort — if cascade partially fails, log error but do not roll back the merchant deletion.

Files to modify:

services/api-gateway/src/index.ts — DELETE merchant handler
Test requirements:

Delete merchant with initiated payment — payment cancelled.
Delete merchant with pending settlement — settlement failed.
Delete merchant with completed settlement — unchanged.
Cascade partially fails — merchant still deleted, error logged.
Acceptance criteria:

Soft-deleting a merchant cascades to pending payments/settlements.
Completed records are preserved.