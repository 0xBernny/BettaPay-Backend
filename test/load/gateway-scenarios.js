import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const paymentLatency = new Trend('payment_latency');
const settlementLatency = new Trend('settlement_latency');

// Configuration
const BASE_URL = __ENV.GATEWAY_URL || 'http://localhost:3000';
const MERCHANT_ID = __ENV.MERCHANT_ID || 'test-merchant';
const JWT_TOKEN = __ENV.JWT_TOKEN || '';

const headers = {
  'Content-Type': 'application/json',
  ...(JWT_TOKEN ? { Authorization: `Bearer ${JWT_TOKEN}` } : {}),
};

export const options = {
  scenarios: {
    // Smoke test: low constant load
    smoke: {
      executor: 'constant-vus',
      vus: 2,
      duration: '30s',
      tags: { test_type: 'smoke' },
    },
    // Load test: ramp up to steady state
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 20 },
        { duration: '30s', target: 0 },
      ],
      tags: { test_type: 'load' },
    },
    // Spike test: sudden burst
    spike: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      stages: [
        { duration: '10s', target: 10 },
        { duration: '10s', target: 100 },  // spike to 100 req/s
        { duration: '10s', target: 10 },
      ],
      tags: { test_type: 'spike' },
      startTime: '2m',  // run after load test
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    errors: ['rate<0.1'],
    payment_latency: ['p(95)<600'],
    settlement_latency: ['p(95)<800'],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateIdempotencyKey() {
  return `k6-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Scenarios ────────────────────────────────────────────────────────────────

function healthCheck() {
  const res = http.get(`${BASE_URL}/api/health`);
  check(res, {
    'health: status 200': (r) => r.status === 200,
    'health: has data envelope': (r) => {
      try { return 'data' in JSON.parse(r.body); } catch { return false; }
    },
  }) || errorRate.add(1);
}

function getMerchant() {
  const res = http.get(`${BASE_URL}/api/merchants/${MERCHANT_ID}`, { headers });
  check(res, {
    'merchant: status 200': (r) => r.status === 200 || r.status === 404,
    'merchant: has data envelope on 200': (r) => {
      if (r.status !== 200) return true;
      try { return 'data' in JSON.parse(r.body); } catch { return false; }
    },
  }) || errorRate.add(1);
}

function createPayment() {
  const payload = JSON.stringify({
    merchantId: MERCHANT_ID,
    payerId: `payer-${Math.random().toString(36).slice(2, 8)}`,
    amount: (Math.random() * 100).toFixed(2),
    asset: 'USDC',
    reference: `k6-ref-${Date.now()}`,
  });

  const idempotencyKey = generateIdempotencyKey();
  const reqHeaders = { ...headers, 'Idempotency-Key': idempotencyKey };

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/payments`, payload, { headers: reqHeaders });
  paymentLatency.add(Date.now() - start);

  check(res, {
    'payment: status 201': (r) => r.status === 201,
    'payment: has data envelope': (r) => {
      try { return 'data' in JSON.parse(r.body); } catch { return false; }
    },
  }) || errorRate.add(1);

  // Idempotency check: same key should return same payment
  if (res.status === 201) {
    const res2 = http.post(`${BASE_URL}/api/payments`, payload, { headers: reqHeaders });
    check(res2, {
      'idempotency: same key returns 200': (r) => r.status === 200,
      'idempotency: same payment id': (r) => {
        try {
          const first = JSON.parse(res.body);
          const second = JSON.parse(r.body);
          return first.data?.id === second.data?.id;
        } catch { return false; }
      },
    }) || errorRate.add(1);
  }

  return res.status === 201 ? JSON.parse(res.body).data : null;
}

function listSettlements() {
  const res = http.get(`${BASE_URL}/api/settlements?limit=10&offset=0`, { headers });
  check(res, {
    'settlements: status 200': (r) => r.status === 200,
    'settlements: has data array': (r) => {
      try { return Array.isArray(JSON.parse(r.body).data); } catch { return false; }
    },
    'settlements: has pagination': (r) => {
      try { return 'pagination' in JSON.parse(r.body); } catch { return false; }
    },
  }) || errorRate.add(1);
}

function createSettlement() {
  const payload = JSON.stringify({
    merchantId: MERCHANT_ID,
    items: [
      { amount: (Math.random() * 50).toFixed(2), asset: 'USDC' },
    ],
  });

  const start = Date.now();
  const res = http.post(`${BASE_URL}/api/settlements`, payload, { headers });
  settlementLatency.add(Date.now() - start);

  check(res, {
    'settlement create: status 201 or 200': (r) => r.status === 201 || r.status === 200,
  }) || errorRate.add(1);
}

function getRates() {
  const res = http.get(`${BASE_URL}/api/rates`, { headers });
  check(res, {
    'rates: status 200': (r) => r.status === 200,
  }) || errorRate.add(1);
}

// ── Default function (main VU loop) ──────────────────────────────────────────

export default function () {
  const scenario = __ENV.K6_SCENARIO || 'mixed';

  switch (scenario) {
    case 'health':
      healthCheck();
      break;
    case 'payments':
      createPayment();
      break;
    case 'settlements':
      listSettlements();
      createSettlement();
      break;
    default:
      // Mixed: spread load across endpoints
      healthCheck();
      getMerchant();
      if (Math.random() < 0.4) createPayment();
      if (Math.random() < 0.3) listSettlements();
      if (Math.random() < 0.1) createSettlement();
      if (Math.random() < 0.2) getRates();
      break;
  }

  sleep(1);
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

export function setup() {
  const res = http.get(`${BASE_URL}/api/health`);
  if (res.status !== 200) {
    console.warn(`Warning: Gateway health check returned ${res.status}`);
  }
  return { startTime: Date.now() };
}

export function teardown(data) {
  const duration = ((Date.now() - data.startTime) / 1000).toFixed(1);
  console.log(`Load test completed in ${duration}s`);
}
