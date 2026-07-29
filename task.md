```Current behavior:
No way to test webhook URL configuration before relying on real events.
Expected behavior:
Add POST /api/webhooks/:id/test (service-auth). Sends test payload { type: "test", timestamp, subscriptionId, test: true }. Single attempt, 5s timeout. Returns { success, statusCode, error }. Stores lastTestedAt, lastTestStatus, lastTestStatusCode on subscription.
Files to modify:
prisma/schema.prisma — add test result fields
New migration
services/indexer/src/index.ts — add endpoint
shared/validation/schemas.ts
Test requirements:
Mock server returns 200 — test passes.
Mock server returns 500 — test fails.
Unreachable URL — test fails, no status code.
Non-existent subscription — 404.
Acceptance criteria:
Webhook URLs testable before real use.
Test results stored on subscription record.
```

```Current behavior:
Rate limiting per endpoint but no IP reputation scoring.
Expected behavior:
Maintain IP score in Redis for auth endpoints. Increment on failure, decrement on success. When score exceeds AUTH_IP_THRESHOLD (default 20) in 15-min rolling window, return 429 with 5-min Retry-After. Expose score via GET /api/admin/auth/ip-score?ip=X.
Files to modify:
services/api-gateway/src/index.ts — scoring middleware and admin endpoint
shared/validation/index.ts — add env var
Test requirements:
20 failed auths from same IP — 21st gets 429 with long Retry-After.
Successful auth decrements score.
Different IPs unaffected.
Acceptance criteria:
IPs with suspicious auth activity get extended rate limits.
Scores decay on success.
```

```Current behavior:
Nonce can be used twice if the client sends the same signed challenge again.
Expected behavior:
After successful wallet verification, store used_nonce:{nonce} in Redis with 5-minute TTL. On subsequent verify requests, check if nonce is used. Return 409 Conflict if reused.
Files to modify:
services/api-gateway/src/index.ts — wallet verification handler
Test requirements:
Verify with nonce — success.
Verify with same nonce again — 409.
Verify with different nonce — success.
Acceptance criteria:
Nonces cannot be replayed.
409 returned for reused nonces.

```

Current behavior:
Tokens expire after JWT_EXPIRES_IN (24h) with no refresh — merchant must re-authenticate.
Expected behavior:
Add POST /api/auth/refresh accepting valid JWT. Returns new JWT with fresh expiry. Revoke old token by adding its jti to Redis blocklist with TTL matching original remaining lifetime. Add jti claim to all new tokens. Rate-limited at 10 req/min per merchant.
Files to modify:
services/api-gateway/src/index.ts — add refresh route
Modify JWT creation to include jti
Test requirements:
Refresh valid token — new token returned, old one revoked.
Refresh expired token — 401.
Use revoked token — 401.
Rate limit — 11th request gets 429.
Acceptance criteria:
Token refresh extends session without re-authentication.
Old tokens are invalidated.
```
