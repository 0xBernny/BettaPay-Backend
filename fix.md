Deduplicate webhook delivery for settlement completion events
Repo Avatar
Betta-Pay/BettaPay-Backend
Current behavior:
Webhook may be sent twice if worker restarts before ack persists.

Expected behavior:
Generate unique eventId (UUID). Before dispatch, Redis SET webhook_sent:{eventId} NX EX 3600. If key exists, skip and log warning. If Redis is down, deliver anyway (fail-open).

Files to modify:

shared/webhook-delivery/index.ts — add Redis SET NX check
services/settlement-engine/src/index.ts — generate eventId
Test: shared/webhook-delivery/index.test.ts
Test requirements:

Deliver webhook — eventId recorded in Redis.
Deliver same webhook again — skipped, warning logged.
Redis unavailable — delivered without dedup.
Acceptance criteria:

Duplicate webhooks prevented within 1-hour window.
Resilient to Redis outages