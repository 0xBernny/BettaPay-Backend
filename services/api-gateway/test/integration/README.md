# Integration Tests

These tests use `fastify.inject()` to test the real route handlers end-to-end without requiring a running server or network stack.

## Setup

Tests require a PostgreSQL database. Set `DATABASE_URL_TEST` or use testcontainers.

```bash
# Run integration tests
DATABASE_URL_TEST=postgresql://localhost:5432/bettapay_test pnpm --filter api-gateway test:integration
```

## Coverage

- [x] Health endpoints
- [x] Merchant CRUD (create, read, soft-delete, restore)
- [x] Merchant settings update
- [x] Payment creation with idempotency
- [x] Payment status transitions
- [x] Settlement listing with pagination
- [x] Settlement creation with daily limit validation
- [x] Response envelope contracts (`{ data }` for success, `{ error }` for failures)
