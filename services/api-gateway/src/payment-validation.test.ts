import test from 'tape';
import { createTestApp, generateTestJwt } from './test-utils.js';

const VALID_STELLAR_KEY = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const INVALID_STELLAR_KEY = 'NOT_A_STELLAR_KEY';

test('validation: POST /api/payments validates merchantId', async (t) => {
  const { app } = createTestApp();
  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      merchantId: INVALID_STELLAR_KEY,
      amount: '10.00',
      asset: 'USDC',
    },
  });

  t.equal(res.statusCode, 400, 'should reject invalid merchantId with 400');
  const body = JSON.parse(res.body);
  t.equal(body.error.code, 'VALIDATION_ERROR');

  const errorDetail = body.error.details.find((d: any) => d.path.includes('merchantId'));
  t.ok(errorDetail, 'should report validation issue on merchantId path');
  await app.close();
  t.end();
});

test('validation: POST /api/payments validates amount format', async (t) => {
  const { app } = createTestApp();
  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      merchantId: VALID_STELLAR_KEY,
      amount: 'not-a-number',
      asset: 'USDC',
    },
  });

  t.equal(res.statusCode, 400, 'should reject non-numeric amount with 400');
  const body = JSON.parse(res.body);
  t.equal(body.error.code, 'VALIDATION_ERROR');
  await app.close();
  t.end();
});

test('validation: POST /api/payments validates asset format', async (t) => {
  const { app } = createTestApp();
  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      merchantId: VALID_STELLAR_KEY,
      amount: '10.00',
      asset: '', // empty asset
    },
  });

  t.equal(res.statusCode, 400, 'should reject empty asset with 400');
  const body = JSON.parse(res.body);
  t.equal(body.error.code, 'VALIDATION_ERROR');
  await app.close();
  t.end();
});

test('validation: POST /api/payments validates payerId if provided', async (t) => {
  const { app } = createTestApp();
  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      merchantId: VALID_STELLAR_KEY,
      amount: '10.00',
      asset: 'USDC',
      payerId: INVALID_STELLAR_KEY,
    },
  });

  t.equal(res.statusCode, 400, 'should reject invalid payerId Stellar key format');
  const body = JSON.parse(res.body);
  t.equal(body.error.code, 'VALIDATION_ERROR');
  await app.close();
  t.end();
});

test('validation: POST /api/merchants validates id and ownerId Stellar addresses', async (t) => {
  const { app } = createTestApp();
  const token = generateTestJwt(app);

  // 1. Invalid id Stellar address
  const res1 = await app.inject({
    method: 'POST',
    url: '/api/merchants',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      id: INVALID_STELLAR_KEY,
      name: 'Test Merchant',
      ownerId: VALID_STELLAR_KEY,
    },
  });
  t.equal(res1.statusCode, 400, 'should reject invalid merchant id address');

  // 2. Invalid ownerId Stellar address
  const res2 = await app.inject({
    method: 'POST',
    url: '/api/merchants',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      id: VALID_STELLAR_KEY,
      name: 'Test Merchant',
      ownerId: INVALID_STELLAR_KEY,
    },
  });
  t.equal(res2.statusCode, 400, 'should reject invalid ownerId address');

  // 3. Missing name
  const res3 = await app.inject({
    method: 'POST',
    url: '/api/merchants',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      id: VALID_STELLAR_KEY,
      ownerId: VALID_STELLAR_KEY,
    },
  });
  t.equal(res3.statusCode, 400, 'should reject missing name');

  await app.close();
  t.end();
});

test('validation: PATCH /api/merchants/:id/settings validates feeBps constraints', async (t) => {
  const { app } = createTestApp({}, {
    merchants: [{ id: 'm1', settings: {} }],
  });
  const token = generateTestJwt(app);

  // 1. feeBps below 0
  const res1 = await app.inject({
    method: 'PATCH',
    url: '/api/merchants/m1/settings',
    headers: { authorization: `Bearer ${token}` },
    payload: { feeBps: -10 },
  });
  t.equal(res1.statusCode, 400, 'should reject feeBps < 0');

  // 2. feeBps above 10000
  const res2 = await app.inject({
    method: 'PATCH',
    url: '/api/merchants/m1/settings',
    headers: { authorization: `Bearer ${token}` },
    payload: { feeBps: 10001 },
  });
  t.equal(res2.statusCode, 400, 'should reject feeBps > 10000');

  // 3. Valid feeBps
  const res3 = await app.inject({
    method: 'PATCH',
    url: '/api/merchants/m1/settings',
    headers: { authorization: `Bearer ${token}` },
    payload: { feeBps: 150 },
  });
  t.equal(res3.statusCode, 200, 'should accept valid feeBps within range');

  await app.close();
  t.end();
});
