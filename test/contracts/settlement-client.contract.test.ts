/**
 * Consumer-driven contract tests for the Settlement client.
 *
 * Verifies the client correctly parses settlement engine responses and handles
 * error cases. If the settlement engine changes its response shape, these tests
 * will catch the breaking change before it reaches production.
 */

import test from 'tape';
import {
  createSettlementClient,
  SettlementEngineUnavailableError,
} from '../../services/api-gateway/src/clients/settlement-client.js';

const BASE = 'http://settlement-engine:3001';

// ── Expected response contracts ─────────────────────────────────────────────

const VALID_SETTLEMENT_RESPONSE = {
  data: {
    id: 'settlement_abc123',
    merchantId: 'merchant_001',
    grossAmount: '1000.0000',
    feeAmount: '25.0000',
    netAmount: '975.0000',
    asset: 'USDC',
    status: 'processing',
    createdAt: new Date().toISOString(),
  },
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

// ── Contract: successful settlement creation ────────────────────────────────

test('contract: settlement-client parses valid settlement response', async (t) => {
  const client = createSettlementClient({
    baseUrl: BASE,
    serviceToken: 'test-secret',
    fetchImpl: async () => jsonResponse(VALID_SETTLEMENT_RESPONSE),
  });

  const result = await client.createSettlement({
    merchantId: 'merchant_001',
    grossAmount: '1000.0000',
    asset: 'USDC',
  });

  t.ok(result, 'returns a settlement object');
  t.equal(result?.id, 'settlement_abc123', 'id matches');
  t.equal(result?.merchantId, 'merchant_001', 'merchantId matches');
  t.equal(result?.grossAmount, '1000.0000', 'grossAmount matches');
  t.equal(result?.asset, 'USDC', 'asset matches');
  t.ok(result?.status, 'status is present');
  t.end();
});

// ── Contract: error responses ───────────────────────────────────────────────

test('contract: settlement-client throws on 503 service unavailable', async (t) => {
  const client = createSettlementClient({
    baseUrl: BASE,
    serviceToken: 'test-secret',
    fetchImpl: async () => jsonResponse({ error: 'Service Unavailable' }, false, 503),
  });

  try {
    await client.createSettlement({
      merchantId: 'merchant_001',
      grossAmount: '1000.0000',
      asset: 'USDC',
    });
    t.fail('should have thrown');
  } catch (err) {
    t.ok(err instanceof SettlementEngineUnavailableError, 'throws SettlementEngineUnavailableError');
  }
  t.end();
});

test('contract: settlement-client throws on network timeout', async (t) => {
  const client = createSettlementClient({
    baseUrl: BASE,
    serviceToken: 'test-secret',
    fetchImpl: async () => { throw new Error('ETIMEDOUT'); },
  });

  try {
    await client.createSettlement({
      merchantId: 'merchant_001',
      grossAmount: '1000.0000',
      asset: 'USDC',
    });
    t.fail('should have thrown');
  } catch (err) {
    t.ok(err instanceof SettlementEngineUnavailableError, 'throws SettlementEngineUnavailableError on timeout');
  }
  t.end();
});

// ── Contract: tracing headers ───────────────────────────────────────────────

test('contract: settlement-client forwards tracing headers', async (t) => {
  let sentHeaders: Record<string, string> | undefined;
  const client = createSettlementClient({
    baseUrl: BASE,
    serviceToken: 'test-secret',
    fetchImpl: async (_url, init) => {
      sentHeaders = (init?.headers ?? {}) as Record<string, string>;
      return jsonResponse(VALID_SETTLEMENT_RESPONSE);
    },
  });

  await client.createSettlement(
    { merchantId: 'merchant_001', grossAmount: '1000.0000', asset: 'USDC' },
    { 'x-request-id': 'req-789', 'x-trace-id': 'trace-012' },
  );

  t.equal(sentHeaders?.['x-request-id'], 'req-789', 'forwards x-request-id');
  t.equal(sentHeaders?.['x-trace-id'], 'trace-012', 'forwards x-trace-id');
  t.end();
});
