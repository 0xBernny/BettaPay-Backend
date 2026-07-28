/**
 * Consumer-driven contract tests for the FX client.
 *
 * These tests define the expected response shape from the FX engine and verify
 * that the client correctly parses valid responses and handles error cases.
 * If the downstream FX engine changes its response shape, these tests will
 * catch the breaking change before it reaches production.
 */

import test from 'tape';
import { createFxClient } from '../../services/api-gateway/src/clients/fx-client.js';

const BASE = 'http://fx-engine:3002';

// ── Expected response contract ──────────────────────────────────────────────

const VALID_QUOTE_RESPONSE = {
  quoteId: 'quote_abc123',
  from: 'USDC',
  to: 'NGN',
  amount: '100.00',
  result: '154550.0000',
  rate: '1545.50000000',
  slippageBps: 50,
  slippageLimit: '0.0050',
  cachedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

// ── Contract: successful quote response ─────────────────────────────────────

test('contract: fx-client parses valid quote response correctly', async (t) => {
  const client = createFxClient({
    baseUrl: BASE,
    fetchImpl: async () => jsonResponse(VALID_QUOTE_RESPONSE),
  });

  const quote = await client.getQuote({ from: 'USDC', to: 'NGN', amount: '100.00' });

  t.ok(quote, 'returns a quote object');
  t.equal(quote?.quoteId, 'quote_abc123', 'quoteId matches');
  t.equal(quote?.from, 'USDC', 'from currency matches');
  t.equal(quote?.to, 'NGN', 'to currency matches');
  t.equal(quote?.amount, '100.00', 'amount matches');
  t.ok(quote?.result, 'result is present');
  t.ok(quote?.rate, 'rate is present');
  t.ok(typeof quote?.slippageBps === 'number', 'slippageBps is a number');
  t.ok(quote?.cachedAt, 'cachedAt is present');
  t.ok(quote?.expiresAt, 'expiresAt is present');
  t.end();
});

// ── Contract: error responses ───────────────────────────────────────────────

test('contract: fx-client returns null on 503 service unavailable', async (t) => {
  const client = createFxClient({
    baseUrl: BASE,
    fetchImpl: async () => jsonResponse({ error: 'Service Unavailable' }, false, 503),
  });

  const quote = await client.getQuote({ from: 'USDC', to: 'NGN', amount: '100.00' });
  t.equal(quote, null, 'returns null on 503');
  t.end();
});

test('contract: fx-client returns null on 500 internal server error', async (t) => {
  const client = createFxClient({
    baseUrl: BASE,
    fetchImpl: async () => jsonResponse({ error: 'Internal Server Error' }, false, 500),
  });

  const quote = await client.getQuote({ from: 'USDC', to: 'NGN', amount: '100.00' });
  t.equal(quote, null, 'returns null on 500');
  t.end();
});

test('contract: fx-client returns null on network timeout', async (t) => {
  const client = createFxClient({
    baseUrl: BASE,
    fetchImpl: async () => { throw new Error('ETIMEDOUT'); },
  });

  const quote = await client.getQuote({ from: 'USDC', to: 'NGN', amount: '100.00' });
  t.equal(quote, null, 'returns null on timeout');
  t.end();
});

// ── Contract: tracing headers ───────────────────────────────────────────────

test('contract: fx-client forwards tracing headers', async (t) => {
  let sentHeaders: Record<string, string> | undefined;
  const client = createFxClient({
    baseUrl: BASE,
    serviceToken: 'test-secret',
    fetchImpl: async (_url, init) => {
      sentHeaders = (init?.headers ?? {}) as Record<string, string>;
      return jsonResponse(VALID_QUOTE_RESPONSE);
    },
  });

  await client.getQuote(
    { from: 'USDC', to: 'NGN', amount: '100.00' },
    { 'x-request-id': 'req-123', 'x-trace-id': 'trace-456' },
  );

  t.equal(sentHeaders?.['x-request-id'], 'req-123', 'forwards x-request-id');
  t.equal(sentHeaders?.['x-trace-id'], 'trace-456', 'forwards x-trace-id');
  t.equal(sentHeaders?.['x-service-token'], 'test-secret', 'includes service token');
  t.end();
});
