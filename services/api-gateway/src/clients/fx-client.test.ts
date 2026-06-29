import test from 'tape';
import {
  createFxClient,
  FxEngineUnavailableError,
  type FxQuote,
} from './fx-client.js';

const BASE = 'http://fx.test:3002';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function makeQuote(overrides: Partial<FxQuote> = {}): FxQuote {
  return {
    quoteId: 'qt_123',
    from: 'USDC',
    to: 'NGN',
    amount: '10.00',
    result: '7500.0000',
    rate: '750.00000000',
    slippageBps: 50,
    slippageLimit: '0.0050',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

test('getQuote fetches quote with auth and tracing headers', async (t) => {
  let calledUrl = '';
  let sentInit: RequestInit | undefined;

  const client = createFxClient({
    baseUrl: `${BASE}/`,
    serviceToken: 'service-secret',
    fetchImpl: async (url, init) => {
      calledUrl = String(url);
      sentInit = init;
      return jsonResponse(makeQuote());
    },
  });

  const result = await client.getQuote('USDC', 'NGN', '10.00', {
    'x-request-id': 'req-1',
    'x-trace-id': 'trace-1',
  });

  const headers = sentInit?.headers as Record<string, string>;
  t.ok(calledUrl.startsWith(`${BASE}/api/quote?`), 'uses fx-engine /api/quote endpoint');
  t.ok(calledUrl.includes('from=USDC'), 'includes from param');
  t.ok(calledUrl.includes('to=NGN'), 'includes to param');
  t.ok(calledUrl.includes('amount=10.00'), 'includes amount param');
  t.equal(sentInit?.method, 'GET', 'uses GET');
  t.equal(headers['x-service-token'], 'service-secret', 'forwards inter-service token');
  t.equal(headers['x-request-id'], 'req-1', 'forwards x-request-id');
  t.equal(headers['x-trace-id'], 'trace-1', 'forwards x-trace-id');
  t.equal(result.status, 200, 'returns downstream status');
  t.equal(result.body.from, 'USDC', 'returns from currency');
  t.equal(result.body.to, 'NGN', 'returns to currency');
  t.equal(result.body.amount, '10.00', 'returns amount');
  t.ok(result.body.quoteId, 'returns quoteId');
  t.ok(result.body.rate, 'returns rate');
  t.end();
});

test('getQuote preserves non-2xx fx-engine responses', async (t) => {
  const client = createFxClient({
    baseUrl: BASE,
    fetchImpl: async () =>
      jsonResponse({ error: { code: 'UNSUPPORTED_CURRENCY_PAIR' } }, 400),
  });

  const result = await client.getQuote('USDC', 'FAKE', '10.00');
  t.equal(result.status, 400, 'keeps downstream status');
  t.end();
});

test('getQuote throws FxEngineUnavailableError on timeout', async (t) => {
  const client = createFxClient({
    baseUrl: BASE,
    timeoutMs: 10,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      }),
  });

  try {
    await client.getQuote('USDC', 'NGN', '10.00');
    t.fail('expected timeout to throw');
  } catch (err) {
    t.ok(err instanceof FxEngineUnavailableError, 'throws typed unavailable error');
  }
  t.end();
});

test('getQuote throws FxEngineUnavailableError on network failure', async (t) => {
  const client = createFxClient({
    baseUrl: BASE,
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });

  try {
    await client.getQuote('USDC', 'NGN', '10.00');
    t.fail('expected network error to throw');
  } catch (err) {
    t.ok(err instanceof FxEngineUnavailableError, 'throws typed unavailable error');
    t.equal((err as Error).message, 'ECONNREFUSED', 'preserves underlying error message');
  }
  t.end();
});
