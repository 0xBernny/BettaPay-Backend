# Bulk Settlements Operations & Runbook

This runbook provides details for operations, systems, and database administrators on maintaining, debugging, and recovering from failures in the Bulk Settlements pipeline.

---

## 1. Monitoring and Health Checks

The settlement engine exposes an API endpoint `/api/health` that details the state of dependencies:
* **Prisma PostgreSQL Connection**: Checks active connection states.
* **Redis Connection**: Checks connection status to the BullMQ backend.
* **BullMQ Queue Health**: Monitors active, pending, failed, and completed job counts.

### 1.1 Alerting Thresholds
Operations should set up alerts on the following metrics:
1. **BullMQ Queue Size**: Trigger warnings if the queue length exceeds 10,000 for more than 10 minutes.
2. **Worker Errors Rate**: Alert if worker failure counts rise above 5% of processed jobs over a 5-minute sliding window.
3. **Database Pool Latency**: Alert if connection pool wait times exceed 2000ms.

---

## 2. Database Queries for Troubleshooting

Administrators can use the following SQL queries directly against the PostgreSQL instance to inspect bulk operations:

### 2.1 Get Progress of a Specific Batch
```sql
SELECT 
  status, 
  COUNT(*) as count,
  COALESCE(SUM(CAST("totalAmount" AS DECIMAL)), 0) as total_value
FROM "Settlement"
WHERE "batchId" = 'batch_8fa9a12c8b9148b3b4f627ce9ef01a2f'
GROUP BY status;
```

### 2.2 Find Stuck Pending Settlements
Finds settlements created more than 1 hour ago that are still in `pending` state (which indicates a queue worker failure or unhandled crash):
```sql
SELECT id, "merchantId", "totalAmount", asset, "initiatedAt"
FROM "Settlement"
WHERE status = 'pending'
AND "initiatedAt" < NOW() - INTERVAL '1 hour';
```

### 2.3 Aggregate Daily Volumes by Merchant
```sql
SELECT 
  "merchantId",
  COUNT(*) as total_settlements,
  COALESCE(SUM(CAST("totalAmount" AS DECIMAL)), 0) as total_amount
FROM "Settlement"
WHERE "initiatedAt" >= CURRENT_DATE
GROUP BY "merchantId";
```

---

## 3. Recovery and Disaster Mitigation Runbook

In the event of infrastructure outages, follow these recovery pipelines:

### 3.1 Redis Outage
If the Redis instance goes down, incoming HTTP POST `/api/settlements/bulk` requests will still successfully commit records to the database because of fallback mechanics, but enqueuing jobs to BullMQ will fail. 

Once Redis is restored:
1. Identify all settlements created during the outage that are still marked as `pending`:
   ```sql
   SELECT id, "merchantId", "grossAmount", asset 
   FROM "Settlement" 
   WHERE status = 'pending';
   ```
2. Trigger the script `scripts/re-enqueue-pending.ts` to read these records and re-publish them to the BullMQ queue:
   ```bash
   pnpm run re-enqueue --status=pending
   ```

### 3.2 Database Transaction Lock Timeout
Under heavy traffic, bulk transaction insertions might encounter locks:
1. The engine will automatically return a `500 Internal Server Error` to the client.
2. The client application should implement retry policies with exponential backoff and jitter.
3. Check active connection pool stats on the engine server to ensure `DATABASE_POOL_SIZE` matches requirements.

---

## 4. Runbook for Dead Letter Queue (DLQ) Cleanup

When jobs fail 3 times, they are routed to the DLQ (`settlements-dlq` queue in Redis). 
To clear or retry these jobs:
1. Connect to the admin dashboard or run the queue command utility:
   ```bash
   pnpm run queue-admin --retry-dlq
   ```
2. Inspect the failure reasons (e.g. invalid Stellar signatures, bad RPC headers).
3. If failures are permanent (e.g., incorrect destination addresses), delete them from the DLQ:
   ```bash
   pnpm run queue-admin --clear-dlq
   ```
