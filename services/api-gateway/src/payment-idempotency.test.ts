import test from 'tape';
import crypto from 'crypto';
import { createTestApp, generateTestJwt } from './test-utils.js';

test('1. First request without Idempotency-Key creates a payment (201)', async (t) => {
  const { app, mockPrisma } = createTestApp();
  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: { authorization: `Bearer ${token}` },
    payload: { merchantId: 'merch_1', amount: '10.00', asset: 'USDC' },
  });

  t.equal(res.statusCode, 201, 'returns 201');
  const body = JSON.parse(res.body);
  t.ok(body.id, 'payment has an id');
  t.equal(body.status, 'initiated', 'status is initiated');
  t.notOk(body.idempotencyKey, 'no idempotencyKey stored when not provided');

  const stored = await mockPrisma.payment.findUnique({ where: { id: body.id } });
  t.ok(stored, 'persisted in mock database');

  await app.close();
  t.end();
});

test('2. First request with Idempotency-Key creates a payment (201)', async (t) => {
  const { app, mockPrisma } = createTestApp();
  const token = generateTestJwt(app);
  const key = crypto.randomUUID();

  const res = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': key,
    },
    payload: { merchantId: 'merch_1', amount: '10.00', asset: 'USDC' },
  });

  t.equal(res.statusCode, 201, 'returns 201');
  const body = JSON.parse(res.body);
  t.equal(body.idempotencyKey, key, 'idempotencyKey is stored on the payment');

  const stored = await mockPrisma.payment.findUnique({ where: { id: body.id } });
  t.equal(stored.idempotencyKey, key, 'persisted idempotencyKey in DB');

  await app.close();
  t.end();
});

test('3. Duplicate request with same Idempotency-Key returns existing payment (200)', async (t) => {
  const key = crypto.randomUUID();
  const existingPayment = {
    id: 'pay_existing_1',
    merchantId: 'merch_1',
    amount: '10.00',
    asset: 'USDC',
    status: 'initiated',
    idempotencyKey: key,
    idempotencyKeyExpiresAt: new Date(Date.now() + 86400000),
  };
  const { app } = createTestApp({}, { payments: [existingPayment] });
  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': key,
    },
    payload: { merchantId: 'merch_1', amount: '10.00', asset: 'USDC' },
  });

  t.equal(res.statusCode, 200, 'duplicate request returns 200');
  const body = JSON.parse(res.body);
  t.equal(body.id, 'pay_existing_1', 'returns existing payment id');
  t.equal(body.idempotencyKey, key, 'same idempotency key');

  await app.close();
  t.end();
});

test('4. Requests without Idempotency-Key always create new payments', async (t) => {
  const { app, mockPrisma } = createTestApp();
  const token = generateTestJwt(app);

  const r1 = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: { authorization: `Bearer ${token}` },
    payload: { merchantId: 'merch_1', amount: '10.00', asset: 'USDC' },
  });

  const r2 = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: { authorization: `Bearer ${token}` },
    payload: { merchantId: 'merch_1', amount: '10.00', asset: 'USDC' },
  });

  t.equal(r1.statusCode, 201, 'first request is 201');
  t.equal(r2.statusCode, 201, 'second request is 201');
  t.equal(mockPrisma.store.payments.length, 2, 'two separate payments created in DB');

  await app.close();
  t.end();
});

test('5. TTL expiration — expired key is treated as absent, new payment is created (201)', async (t) => {
  const key = crypto.randomUUID();
  const expiredPayment = {
    id: 'pay_old',
    merchantId: 'merch_1',
    amount: '10.00',
    asset: 'USDC',
    status: 'initiated',
    idempotencyKey: key,
    idempotencyKeyExpiresAt: new Date(Date.now() - 1000), // expired
  };

  const { app, mockPrisma } = createTestApp({}, { payments: [expiredPayment] });
  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': key,
    },
    payload: { merchantId: 'merch_1', amount: '10.00', asset: 'USDC' },
  });

  t.equal(res.statusCode, 201, 'returns 201 for expired key');
  const body = JSON.parse(res.body);
  t.notEqual(body.id, 'pay_old', 'created a new payment');
  t.equal(mockPrisma.store.payments.length, 2, 'new record added to DB');

  await app.close();
  t.end();
});

test('6. Idempotency-Key exceeding 255 characters is rejected (400)', async (t) => {
  const { app } = createTestApp();
  const token = generateTestJwt(app);
  const longKey = 'a'.repeat(256);

  const res = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': longKey,
    },
    payload: { merchantId: 'merch_1', amount: '10.00', asset: 'USDC' },
  });

  t.equal(res.statusCode, 400, 'returns 400 for oversized key');
  t.ok(JSON.parse(res.body).error.message.includes('255'), 'error message mentions 255 character limit');

  await app.close();
  t.end();
});
