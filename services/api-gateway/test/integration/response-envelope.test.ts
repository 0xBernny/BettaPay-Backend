import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../src/index.js';
import { createMockPrisma, generateTestJwt, createTestApp } from '../../src/test-utils.js';
import { MOCK_MERCHANT_ACTIVE, MOCK_PAYMENT_INITIATED, MOCK_STELLAR_KEY_1 } from '../../src/test-fixtures.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

function createTestSetup(data: Record<string, any[]> = {}) {
  const prisma = createMockPrisma({
    merchants: data.merchants || [MOCK_MERCHANT_ACTIVE],
    payments: data.payments || [],
    settlements: data.settlements || [],
    auditLogs: data.auditLogs || [],
  }) as any;

  const fetchImpl = async (url: string | URL | Request) => {
    const target = String(url);
    if (target.includes('/api/quote')) {
      return jsonResponse({ from: 'USDC', to: 'NGN', rate: '1500.00', amount: '100', converted: '150000' });
    }
    return jsonResponse({ status: 'ok' });
  };

  const app = buildApp({ prisma, logger: false, fetchImpl: fetchImpl as any });
  const token = generateTestJwt(app, { merchantId: MOCK_STELLAR_KEY_1, ownerId: 'owner-user-active-01' });

  return { app, prisma, token };
}

// ── Response Envelope Contract Tests ─────────────────────────────────────────

test('GET /api/health returns liveness probe', async () => {
  const { app } = createTestSetup();
  const res = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.service === 'api-gateway');
  await app.close();
});

test('POST /api/merchants returns { data: { merchant, secret } }', async () => {
  const { app, token } = createTestSetup();
  const res = await app.inject({
    method: 'POST',
    url: '/api/merchants',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      id: 'new-merchant-001',
      name: 'Test Merchant',
      ownerId: 'owner-test-001',
    },
  });
  assert.equal(res.statusCode, 201);
  const body = JSON.parse(res.body);
  assert.ok(body.data, 'Response must have data field');
  assert.ok(body.data.merchant, 'data must contain merchant');
  assert.ok(body.data.secret, 'data must contain secret');
  assert.ok(body.data.merchant.id, 'merchant must have id');
  assert.ok(typeof body.data.secret === 'string', 'secret must be a string');
  await app.close();
});

test('GET /api/merchants/:id returns { data: merchant }', async () => {
  const { app, token } = createTestSetup();
  const res = await app.inject({
    method: 'GET',
    url: `/api/merchants/${MOCK_STELLAR_KEY_1}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.data, 'Response must have data field');
  assert.equal(body.data.id, MOCK_STELLAR_KEY_1);
  assert.ok(!body.data.secretHash, 'secretHash must not be exposed');
  await app.close();
});

test('GET /api/merchants/:id returns { error } on not found', async () => {
  const { app, token } = createTestSetup();
  const res = await app.inject({
    method: 'GET',
    url: '/api/merchants/nonexistent',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 404);
  const body = JSON.parse(res.body);
  assert.ok(body.error, 'Error response must have error field');
  assert.ok(body.error.code, 'error must have code');
  assert.ok(body.error.message, 'error must have message');
  await app.close();
});

test('DELETE /api/merchants/:id soft-deletes and returns { data }', async () => {
  const { app, token } = createTestSetup();
  const res = await app.inject({
    method: 'DELETE',
    url: `/api/merchants/${MOCK_STELLAR_KEY_1}`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.data, 'Response must have data field');
  assert.ok(body.data.deletedAt, 'deletedAt must be set');
  await app.close();
});

test('POST /api/merchants/:id/restore restores soft-deleted merchant', async () => {
  const deletedMerchant = {
    ...MOCK_MERCHANT_ACTIVE,
    id: 'deleted-merchant-001',
    deletedAt: new Date('2026-01-01'),
  };
  const { app, token } = createTestSetup({ merchants: [deletedMerchant] });
  const res = await app.inject({
    method: 'POST',
    url: '/api/merchants/deleted-merchant-001/restore',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.data, 'Response must have data field');
  assert.equal(body.data.deletedAt, null, 'deletedAt must be null after restore');
  await app.close();
});

test('PATCH /api/merchants/:id/settings returns { data: { merchant } }', async () => {
  const { app, token } = createTestSetup();
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/merchants/${MOCK_STELLAR_KEY_1}/settings`,
    headers: { authorization: `Bearer ${token}` },
    payload: { feeBps: 200 },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.data, 'Response must have data field');
  assert.ok(body.data.merchant, 'data must contain merchant');
  assert.equal(body.data.merchant.settings.feeBps, 200);
  await app.close();
});

test('POST /api/payments returns { data: payment }', async () => {
  const { app, token } = createTestSetup();
  const res = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      merchantId: MOCK_STELLAR_KEY_1,
      payerId: 'payer-001',
      amount: '100.00',
      asset: 'USDC',
      reference: 'test-ref-001',
    },
  });
  assert.equal(res.statusCode, 201);
  const body = JSON.parse(res.body);
  assert.ok(body.data, 'Response must have data field');
  assert.ok(body.data.id, 'data must have id');
  assert.equal(body.data.status, 'initiated');
  assert.equal(body.data.amount, '100.00');
  await app.close();
});

test('POST /api/payments with FX quote returns { data: { ...payment, fxQuote } }', async () => {
  const { app, token } = createTestSetup();
  const res = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      merchantId: MOCK_STELLAR_KEY_1,
      payerId: 'payer-002',
      amount: '100.00',
      asset: 'USDC',
      convertTo: 'NGN',
    },
  });
  assert.equal(res.statusCode, 201);
  const body = JSON.parse(res.body);
  assert.ok(body.data, 'Response must have data field');
  assert.ok(body.data.fxQuote, 'data must include fxQuote when convertTo is set');
  await app.close();
});

test('POST /api/payments idempotency returns { data: payment } on cache hit', async () => {
  const { app, token } = createTestSetup();

  // First request — creates payment
  const res1 = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': 'test-idem-key-001',
    },
    payload: {
      merchantId: MOCK_STELLAR_KEY_1,
      payerId: 'payer-003',
      amount: '50.00',
      asset: 'USDC',
    },
  });
  assert.equal(res1.statusCode, 201);

  // Second request — should return cached
  const res2 = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': 'test-idem-key-001',
    },
    payload: {
      merchantId: MOCK_STELLAR_KEY_1,
      payerId: 'payer-003',
      amount: '50.00',
      asset: 'USDC',
    },
  });
  assert.equal(res2.statusCode, 200, 'Idempotent request should return 200');
  const body = JSON.parse(res2.body);
  assert.ok(body.data, 'Idempotent response must have data field');
  assert.ok(body.data.id, 'Cached payment must have id');
  await app.close();
});

test('GET /api/payments/:id returns { data: payment }', async () => {
  const payment = {
    ...MOCK_PAYMENT_INITIATED,
    id: 'pay-test-001',
    merchantId: MOCK_STELLAR_KEY_1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { app } = createTestSetup({ payments: [payment] });

  const res = await app.inject({
    method: 'GET',
    url: '/api/payments/pay-test-001',
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.data, 'Response must have data field');
  assert.equal(body.data.id, 'pay-test-001');
  await app.close();
});

test('GET /api/payments/:id returns { error } on not found', async () => {
  const { app } = createTestSetup();
  const res = await app.inject({
    method: 'GET',
    url: '/api/payments/nonexistent',
  });
  assert.equal(res.statusCode, 404);
  const body = JSON.parse(res.body);
  assert.ok(body.error, 'Error response must have error field');
  await app.close();
});

test('PATCH /api/payments/:id/status returns { data: payment }', async () => {
  const payment = {
    ...MOCK_PAYMENT_INITIATED,
    id: 'pay-status-001',
    merchantId: MOCK_STELLAR_KEY_1,
    status: 'initiated',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { app, token } = createTestSetup({ payments: [payment] });

  const res = await app.inject({
    method: 'PATCH',
    url: '/api/payments/pay-status-001/status',
    headers: { authorization: `Bearer ${token}` },
    payload: { status: 'completed' },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.data, 'Response must have data field');
  assert.equal(body.data.status, 'completed');
  await app.close();
});

test('PATCH /api/payments/:id/status returns 422 on invalid transition', async () => {
  const payment = {
    ...MOCK_PAYMENT_INITIATED,
    id: 'pay-terminal-001',
    merchantId: MOCK_STELLAR_KEY_1,
    status: 'completed',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { app, token } = createTestSetup({ payments: [payment] });

  const res = await app.inject({
    method: 'PATCH',
    url: '/api/payments/pay-terminal-001/status',
    headers: { authorization: `Bearer ${token}` },
    payload: { status: 'failed' },
  });
  assert.equal(res.statusCode, 422);
  const body = JSON.parse(res.body);
  assert.ok(body.error, 'Error response must have error field');
  await app.close();
});

test('GET /api/settlements returns { data: [], pagination: {} }', async () => {
  const { app, token } = createTestSetup({
    settlements: [
      { id: 'set-001', merchantId: MOCK_STELLAR_KEY_1, status: 'PENDING', totalAmount: '100.00', initiatedAt: new Date() },
      { id: 'set-002', merchantId: MOCK_STELLAR_KEY_1, status: 'COMPLETED', totalAmount: '200.00', initiatedAt: new Date() },
    ],
  });

  const res = await app.inject({
    method: 'GET',
    url: '/api/settlements?limit=10&offset=0',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(Array.isArray(body.data), 'Response must have data array');
  assert.ok(body.pagination, 'Response must have pagination object');
  assert.equal(typeof body.pagination.total, 'number', 'pagination.total must be number');
  assert.equal(typeof body.pagination.limit, 'number', 'pagination.limit must be number');
  assert.equal(typeof body.pagination.offset, 'number', 'pagination.offset must be number');
  assert.equal(typeof body.pagination.hasMore, 'boolean', 'pagination.hasMore must be boolean');
  assert.equal(body.data.length, 2);
  await app.close();
});

test('POST /api/settlements creates settlement', async () => {
  const merchantWithLimits = {
    ...MOCK_MERCHANT_ACTIVE,
    settings: {
      ...MOCK_MERCHANT_ACTIVE.settings,
      minSettlementAmount: '10.00',
      maxSettlementAmount: '5000.00',
      dailySettlementLimit: '10000.00',
    },
  };
  const { app, token, prisma } = createTestSetup({ merchants: [merchantWithLimits] });

  // Mock $queryRaw for daily limit check
  (prisma as any).$queryRaw = async () => [{ sum: '0' }];

  const res = await app.inject({
    method: 'POST',
    url: '/api/settlements',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      merchantId: MOCK_STELLAR_KEY_1,
      items: [{ amount: '100.00', asset: 'USDC' }],
    },
  });
  // Should either succeed (201) or pass through to settlement engine
  assert.ok([200, 201, 502, 504].includes(res.statusCode), `Unexpected status: ${res.statusCode}`);
  await app.close();
});

test('POST /api/settlements returns 422 when below minimum', async () => {
  const merchantWithLimits = {
    ...MOCK_MERCHANT_ACTIVE,
    settings: {
      ...MOCK_MERCHANT_ACTIVE.settings,
      minSettlementAmount: '100.00',
    },
  };
  const { app, token, prisma } = createTestSetup({ merchants: [merchantWithLimits] });
  (prisma as any).$queryRaw = async () => [{ sum: '0' }];

  const res = await app.inject({
    method: 'POST',
    url: '/api/settlements',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      merchantId: MOCK_STELLAR_KEY_1,
      items: [{ amount: '5.00', asset: 'USDC' }],
    },
  });
  assert.equal(res.statusCode, 422);
  const body = JSON.parse(res.body);
  assert.ok(body.error, 'Error response must have error field');
  assert.ok(body.error.message.includes('below minimum'), 'Error should mention minimum');
  await app.close();
});

test('POST /api/settlements returns 422 when daily limit exceeded', async () => {
  const merchantWithLimits = {
    ...MOCK_MERCHANT_ACTIVE,
    settings: {
      ...MOCK_MERCHANT_ACTIVE.settings,
      dailySettlementLimit: '1000.00',
    },
  };
  const { app, token, prisma } = createTestSetup({ merchants: [merchantWithLimits] });
  (prisma as any).$queryRaw = async () => [{ sum: '900' }];

  const res = await app.inject({
    method: 'POST',
    url: '/api/settlements',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      merchantId: MOCK_STELLAR_KEY_1,
      items: [{ amount: '200.00', asset: 'USDC' }],
    },
  });
  assert.equal(res.statusCode, 422);
  const body = JSON.parse(res.body);
  assert.ok(body.error, 'Error response must have error field');
  assert.ok(body.error.message.includes('Daily settlement limit'), 'Error should mention daily limit');
  await app.close();
});

test('GET /api/deployments returns { data: deployments }', async () => {
  const { app } = createTestSetup();
  const res = await app.inject({ method: 'GET', url: '/api/deployments' });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.ok(body.data, 'Response must have data field');
  assert.ok(body.data.network, 'data must have network');
  assert.ok(Array.isArray(body.data.contracts), 'data must have contracts array');
  assert.ok(body.data.updatedAt, 'data must have updatedAt');
  await app.close();
});

test('GET /api/rates proxies to FX engine', async () => {
  const { app } = createTestSetup();
  const res = await app.inject({ method: 'GET', url: '/api/rates' });
  assert.equal(res.statusCode, 200);
  await app.close();
});

test('Unauthenticated request returns 401', async () => {
  const { app } = createTestSetup();
  const res = await app.inject({
    method: 'GET',
    url: `/api/merchants/${MOCK_STELLAR_KEY_1}`,
  });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test('POST /api/payments returns 400 for invalid body', async () => {
  const { app, token } = createTestSetup();
  const res = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: { authorization: `Bearer ${token}` },
    payload: { merchantId: MOCK_STELLAR_KEY_1 },  // missing required fields
  });
  assert.equal(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.ok(body.error, 'Error response must have error field');
  await app.close();
});
