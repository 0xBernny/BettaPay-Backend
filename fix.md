Add deviation guard to reject extreme rate changes from CoinGecko
Repo Avatar
Betta-Pay/BettaPay-Backend
Current behavior:
All CoinGecko rates accepted unconditionally — flash crashes propagate instantly.

Expected behavior:
Add MAX_DEVIATION_BPS (default 2000 = 20%). Before updating cache, compare new rate to old rate. If deviation exceeds threshold, reject, log error, preserve old rate. Add admin override endpoint POST /api/admin/rates/override to bypass guard.

Files to modify:

services/fx-engine/src/index.ts — deviation check and override endpoint
shared/validation/index.ts — add env var
shared/validation/schemas.ts — override body schema
Test: rate-refresh.test.ts
Test requirements:

10% deviation (max 20%) — accepted.
30% deviation (max 20%) — rejected, old rate preserved.
No old rate — accepted unconditionally.
Admin override bypasses guard.
Old rate is 0 — accepted (no division by zero).
Acceptance criteria:

Extreme rate changes rejected, previous valid rate served.
Admin can override when change is legitimate.