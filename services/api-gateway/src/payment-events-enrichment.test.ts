import test from 'tape';
import Fastify from 'fastify';
import { createErrorResponse, ErrorCodes } from '@bettapay/validation';
import type { IndexerClient, IndexerEvent } from './clients/indexer-client.js';

// Mirrors the GET /api/payments/:id enrichment logic in src/index.ts, backed by
// an in-memory payment and an injectable indexer client (same self-contained
// style as payment-status.test.ts) so no DB or live indexer is required.

const PAYMENT = { id: 'pay_1', merchantId: 'merchant_1', status: 'completed', amount: '10.00', asset: 'USDC' };

function buildApp(indexer: IndexerClient, payment: typeof PAYMENT | null = PAYMENT) {
  const app = Fastify({ logger: false });

  app.get<{ Params: { id: string }; Querystring: { includeEvents?: string } }>(
    '/api/payments/:id',
    async (request, reply) => {
      if (!payment) return reply.code(404).send(createErrorResponse(ErrorCodes.NOT_FOUND, 'Payment not found'));

      if (request.query.includeEvents === 'true') {
        const events = await indexer.getPaymentEvents(payment.merchantId);
        return { ...payment, events };
      }
      return payment;
    },
  );

  return app;
}

const sampleEvents: IndexerEvent[] = [
  { id: 'evt_0', contractId: 'C1', topics: ['PaymentCompleted'], type: 'PaymentCompleted', rawValue: 'AAAA', ledger: 100, indexedAt: 'now' },
];

test('includeEvents=true enriches the payment with indexer events', async (t) => {
  let askedFor = '';
  const indexer: IndexerClient = {
    async getPaymentEvents(merchantId) {
      askedFor = merchantId;
      return sampleEvents;
    },
  };
  const app = buildApp(indexer);
  const res = await app.inject({ method: 'GET', url: '/api/payments/pay_1?includeEvents=true' });
  const body = JSON.parse(res.body);

  t.equal(res.statusCode, 200, 'returns 200');
  t.equal(askedFor, 'merchant_1', 'queries indexer with the payment merchantId');
  t.equal(body.id, 'pay_1', 'still returns the payment');
  t.equal(body.events.length, 1, 'includes the on-chain events');
  await app.close();
  t.end();
});

test('indexer unavailability degrades to payment data with events: null', async (t) => {
  const indexer: IndexerClient = {
    async getPaymentEvents() {
      return null; // simulates indexer down / timeout
    },
  };
  const app = buildApp(indexer);
  const res = await app.inject({ method: 'GET', url: '/api/payments/pay_1?includeEvents=true' });
  const body = JSON.parse(res.body);

  t.equal(res.statusCode, 200, 'still returns 200 despite indexer being down');
  t.equal(body.id, 'pay_1', 'payment data is returned');
  t.equal(body.events, null, 'events is null (gracefully degraded)');
  await app.close();
  t.end();
});

test('without includeEvents the indexer is not queried', async (t) => {
  let called = false;
  const indexer: IndexerClient = {
    async getPaymentEvents() {
      called = true;
      return sampleEvents;
    },
  };
  const app = buildApp(indexer);
  const res = await app.inject({ method: 'GET', url: '/api/payments/pay_1' });
  const body = JSON.parse(res.body);

  t.equal(res.statusCode, 200, 'returns 200');
  t.notOk(called, 'indexer client is not called');
  t.equal(body.events, undefined, 'no events field on the default response');
  await app.close();
  t.end();
});

test('a missing payment returns 404 regardless of includeEvents', async (t) => {
  const indexer: IndexerClient = { async getPaymentEvents() { return sampleEvents; } };
  const app = buildApp(indexer, null);
  const res = await app.inject({ method: 'GET', url: '/api/payments/nope?includeEvents=true' });
  t.equal(res.statusCode, 404, 'returns 404 Not Found');
  await app.close();
  t.end();
});
