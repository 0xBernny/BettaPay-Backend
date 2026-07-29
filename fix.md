Current behavior:
Indexes on single columns — most common queries use sequential scans.

Expected behavior:
Add composite indexes:

Payment(merchantId, status, createdAt DESC)
Settlement(merchantId, status, initiatedAt DESC)
IndexedEvent(contractId, ledger DESC)
AuditLog(entityType, entityId, createdAt DESC)
Use Prisma migration. Measure before/after with EXPLAIN ANALYZE.
Files to modify:

prisma/schema.prisma — add @@index directives
New migration
Test requirements:
Verify queries use the new indexes (via EXPLAIN ANALYZE in test output).

Acceptance criteria:

All four composite indexes created.
Query plans show index scans instead of sequential scans.