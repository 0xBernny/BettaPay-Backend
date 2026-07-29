Current behavior:
Single DATABASE_URL for all queries — reads contend with writes.

Expected behavior:
Add DATABASE_READ_REPLICA_URL env var. If set, configure Prisma to route reads (findMany, findFirst, count, aggregate) to replica and writes (create, update, delete) to primary using @prisma/extension-read-replicas. Log warning if no replica configured.

Files to modify:

shared/validation/prisma.ts — configure read replicas
.env.example — document new variable
Test requirements:

With replica URL — reads go to replica, writes to primary.
Without replica URL — all queries to primary, warning logged.
Acceptance criteria:

Read replica support with zero code changes to service handlers.
Falls back to primary if no replica conf