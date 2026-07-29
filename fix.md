Pre-validate settlement requests before enqueuing to BullMQ
Repo Avatar
Betta-Pay/BettaPay-Backend
Current behavior:
Job enqueued immediately, merchant validation happens in worker (wastes queue capacity if invalid).

Expected behavior:
In HTTP handler, before enqueuing: check merchant exists (404), not deleted (422), not suspended (403), has fee config (422), and has not exceeded daily volume limit (429, optional).

Files to modify:

services/settlement-engine/src/index.ts — add pre-validation logic
shared/validation/index.ts — add optional DAILY_SETTLEMENT_VOLUME_LIMIT
Test requirements:

Non-existent merchant — 404.
Deleted merchant — 422.
Suspended merchant — 403.
No fee config — 422.
Valid merchant — 201 + job enqueued.
Acceptance criteria:

Failed pre-validations return instantly, no queue consumed.
Valid requests proceed to queue as before.