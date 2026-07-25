# Security Strategy

## CSRF / Same-Origin Protection

BettaPay implements a same-origin policy check on all mutation endpoints (POST, PATCH, DELETE) to prevent cross-site request forgery attacks.

### How It Works

1. **Origin header validation**: An `onRequest` hook inspects the `Origin` header on all non-GET/HEAD/OPTIONS requests.
2. **Allowlist comparison**: The origin is compared against `ALLOWED_ORIGINS` using timing-safe string comparison (`crypto.timingSafeEqual`) to prevent timing attacks.
3. **Server-to-server exemption**: Requests without an `Origin` header are allowed through — these are typically server-to-service calls authenticated via `x-service-token`.
4. **CORS preflight**: The `@fastify/cors` plugin handles preflight OPTIONS requests using the same `ALLOWED_ORIGINS` list.

### Configuration

Set the `ALLOWED_ORIGINS` environment variable as a comma-separated list of allowed origins:

```
ALLOWED_ORIGINS=https://app.bettapay.com,https://admin.bettapay.com
```

### Error Response

Cross-origin mutations are rejected with:

```json
{
  "error": {
    "code": "INVALID_ORIGIN",
    "message": "Request origin is not allowed"
  }
}
```

## Google OAuth Domain Restriction

### Configuration

Set `ALLOWED_EMAIL_DOMAINS` as a comma-separated list of email domains allowed to authenticate:

```
ALLOWED_EMAIL_DOMAINS=example.com,corp.com
```

When unset, all Google accounts are accepted (development mode).

### Error Responses

- **Token invalid**: `401 UNAUTHORIZED` — "Google token verification failed"
- **Email missing**: `400 INVALID_REQUEST` — "Email missing in Google token payload"
- **Domain not allowed**: `403 INVALID_ORIGIN` — "Email domain not allowed"

## Settlement Processing Concurrency

Per-merchant concurrency is limited using a Redis semaphore (`semaphore:settlement:{merchantId}`, max 3, TTL 60s). This prevents a single merchant from monopolizing all worker slots.

## Fee Audit Trail

Every settlement record includes a `feeSnapshot` JSON field capturing the exact fee parameters used at settlement time. This enables forensic analysis of historical fees and is immutable once created.
