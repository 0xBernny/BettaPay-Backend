# Load Testing

## Overview

Load tests use [k6](https://k6.io/) to measure gateway throughput, latency, and rate-limit behavior.

## Prerequisites

```bash
# Install k6
brew install k6          # macOS
# or: snap install k6    # Linux
# or: choco install k6   # Windows
```

## Running Tests

```bash
# Full suite (smoke + load + spike)
npm run test:load

# With custom gateway URL
GATEWAY_URL=http://localhost:3000 npm run test:load

# With authentication
JWT_TOKEN=<token> MERCHANT_ID=<id> npm run test:load

# Specific scenario only
K6_SCENARIO=health npm run test:load
K6_SCENARIO=payments npm run test:load
K6_SCENARIO=settlements npm run test:load
```

## Scenarios

### Smoke Test
- **VUs**: 2
- **Duration**: 30s
- **Purpose**: Verify basic functionality under minimal load

### Load Test
- **VUs**: 0 → 20 → 20 → 0
- **Duration**: 2m
- **Purpose**: Measure steady-state performance at moderate concurrency

### Spike Test
- **Rate**: 10 → 100 → 10 req/s
- **Duration**: 30s (starts at 2m mark)
- **Purpose**: Validate rate limiting and recovery from burst traffic

## Thresholds (SLOs)

| Metric | Target |
|--------|--------|
| `http_req_duration` p95 | < 500ms |
| `http_req_duration` p99 | < 1000ms |
| `errors` rate | < 10% |
| `payment_latency` p95 | < 600ms |
| `settlement_latency` p95 | < 800ms |

## CI Integration

Add to `.github/workflows/load-test.yml`:

```yaml
name: Load Tests
on:
  schedule:
    - cron: '0 3 * * 1'  # Weekly Monday 3am UTC
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/k6-action@v0.3.1
        with:
          filename: test/load/gateway-scenarios.js
        env:
          GATEWAY_URL: ${{ secrets.STAGING_GATEWAY_URL }}
          JWT_TOKEN: ${{ secrets.STAGING_JWT_TOKEN }}
          MERCHANT_ID: ${{ secrets.STAGING_MERCHANT_ID }}
```

## Expected Baselines

Based on a single-instance deployment (4 CPU, 8GB RAM):

| Endpoint | Throughput | p95 Latency |
|----------|-----------|-------------|
| `GET /api/health` | ~2000 req/s | < 50ms |
| `POST /api/payments` | ~300 req/s | < 400ms |
| `GET /api/settlements` | ~500 req/s | < 200ms |
| `POST /api/settlements` | ~100 req/s | < 600ms |

## Troubleshooting

- **Rate limit errors (429)**: Reduce VUs or increase `timeWindow` in rate limit config
- **Connection refused**: Ensure gateway is running and `GATEWAY_URL` is correct
- **Auth errors**: Provide a valid `JWT_TOKEN` with appropriate permissions
- **Timeout errors**: Check upstream services (FX engine, settlement engine) are healthy
