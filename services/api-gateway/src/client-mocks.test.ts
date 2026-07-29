import test from 'tape';
import { createTestApp, generateTestJwt } from './test-utils.js';
import { SettlementEngineUnavailableError } from './clients/settlement-client.js';

test('client-mocks: settlementClient throwing SettlementEngineUnavailableError returns 504', async (t) => {
  const mockSettlementClient = {
    createSettlement: async () => {
      throw new SettlementEngineUnavailableError('settlement-engine down');
    },
  };

  const { app } = createTestApp({
    settlementClient: mockSettlementClient as any,
  }, {
    merchants: [{ id: 'merch_1', settings: {} }],
  });
  
  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/settlements',
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      merchantId: 'merch_1',
      items: [{ amount: '50.00', asset: 'USDC' }],
    },
  });

  t.equal(res.statusCode, 504, 'returns 504 Gateway Timeout');
  const body = JSON.parse(res.body);
  t.equal(body.error.code, 'GATEWAY_TIMEOUT');
  t.equal(body.error.message, 'Settlement engine unavailable');

  await app.close();
  t.end();
});

test('client-mocks: settlementClient throwing unexpected error returns 500', async (t) => {
  const mockSettlementClient = {
    createSettlement: async () => {
      throw new Error('Unexpected network split');
    },
  };

  const { app } = createTestApp({
    settlementClient: mockSettlementClient as any,
  }, {
    merchants: [{ id: 'merch_1', settings: {} }],
  });

  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/settlements',
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      merchantId: 'merch_1',
      items: [{ amount: '50.00', asset: 'USDC' }],
    },
  });

  t.equal(res.statusCode, 500, 'returns 500 Internal Server Error');

  await app.close();
  t.end();
});

test('client-mocks: fxClient returning null falls back gracefully on payment creation', async (t) => {
  const mockFxClient = {
    getQuote: async () => null, // mock quote lookup failure / unavailable
  };

  const { app } = createTestApp({
    fxClient: mockFxClient as any,
  });

  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'POST',
    url: '/api/payments',
    headers: {
      authorization: `Bearer ${token}`,
    },
    payload: {
      merchantId: 'merch_1',
      amount: '10.00',
      asset: 'USDC',
      convertTo: 'EURT',
    },
  });

  t.equal(res.statusCode, 201, 'succeeds with 201 Created');
  const body = JSON.parse(res.body);
  t.equal(body.fxQuote, null, 'fxQuote should be null in response');
  t.equal(body.status, 'initiated', 'payment session still initialized');

  await app.close();
  t.end();
});

test('client-mocks: indexerClient returning null falls back gracefully on payment query', async (t) => {
  const mockIndexerClient = {
    getPaymentEvents: async () => null, // mock indexer down
  };

  const PAYMENT = { id: 'pay_1', merchantId: 'merchant_1', status: 'completed', amount: '10.00', asset: 'USDC' };

  const { app } = createTestApp({
    indexerClient: mockIndexerClient as any,
  }, {
    payments: [PAYMENT],
  });

  const res = await app.inject({
    method: 'GET',
    url: '/api/payments/pay_1?includeEvents=true',
  });

  t.equal(res.statusCode, 200, 'returns 200 OK');
  const body = JSON.parse(res.body);
  t.equal(body.events, null, 'events field is null on indexer failure');

  await app.close();
  t.end();
});
