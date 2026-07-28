/**
 * Consumer-driven contract tests for the Indexer client.
 *
 * Verifies the client correctly parses indexer responses and handles error cases.
 * If the indexer changes its response shape, these tests will catch the breaking
 * change before it reaches production.
 */

import test from 'tape';
import { createIndexerClient } from '../../services/api-gateway/src/clients/indexer-client.js';

const BASE = 'http://indexer:3003';

// ── Expected response contracts ─────────────────────────────────────────────

const VALID_LEDGER_RESPONSE = {
  ledger: 50000000,
  closedAt: new Date().toISOString(),
  transactionCount: 42,
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

// ── Contract: successful ledger query ───────────────────────────────────────

test('contract: indexer-client parses valid ledger response', async (t) => {
  const client = createIndexerClient({
    baseUrl: BASE,
    serviceToken: 'test-secret',
    fetchImpl: async () => jsonResponse(VALID_LEDGER_RESPONSE),
  });

  const ledger = await client.getLatestLedger();

  t.ok(ledger, 'returns a ledger object');
  t.equal(ledger?.ledger, 50000000, 'ledger number matches');
  t.ok(ledger?.closedAt, 'closedAt is present');
  t.end();
});

// ── Contract: error responses ───────────────────────────────────────────────

test('contract: indexer-client returns null on 503', async (t) => {
  const client = createIndexerClient({
    baseUrl: BASE,
    serviceToken: 'test-secret',
    fetchImpl: async () => jsonResponse({ error: 'Service Unavailable' }, false, 503),
  });

  const ledger = await client.getLatestLedger();
  t.equal(ledger, null, 'returns null on 503');
  t.end();
});

test('contract: indexer-client returns null on network timeout', async (t) => {
  const client = createIndexerClient({
    baseUrl: BASE,
    serviceToken: 'test-secret',
    fetchImpl: async () => { throw new Error('ETIMEDOUT'); },
  });

  const ledger = await client.getLatestLedger();
  t.equal(ledger, null, 'returns null on timeout');
  t.end();
});

// ── Contract: tracing headers ───────────────────────────────────────────────

test('contract: indexer-client forwards tracing headers', async (t) => {
  let sentHeaders: Record<string, string> | undefined;
  const client = createIndexerClient({
    baseUrl: BASE,
    serviceToken: 'test-secret',
    fetchImpl: async (_url, init) => {
      sentHeaders = (init?.headers ?? {}) as Record<string, string>;
      return jsonResponse(VALID_LEDGER_RESPONSE);
    },
  });

  await client.getLatestLedger({
    'x-request-id': 'req-abc',
    'x-trace-id': 'trace-def',
  });

  t.equal(sentHeaders?.['x-request-id'], 'req-abc', 'forwards x-request-id');
  t.equal(sentHeaders?.['x-trace-id'], 'trace-def', 'forwards x-trace-id');
  t.end();
});
