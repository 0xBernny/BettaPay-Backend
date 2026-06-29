import test from 'tape';
import Fastify from 'fastify';

interface FakePayment {
  id: string;
  merchantId: string;
  payerId?: string;
  amount: string;
  asset: string;
  status: string;
  reference?: string;
}

interface FakeFxClient {
  getQuote: (
    request: { from: string; to: string; amount: string },
    headers?: Record<string, unknown>,
  ) => Promise<unknown>;
}

function buildApp(fxClient: FakeFxClient) {
  const store: FakePayment[] = [];
  const app = Fastify({ logger: false });

  app.post<{ Body: Record<string, unknown> }>('/api/payments', async (request, reply) => {
    const body = request.body;
    if (!body?.merchantId || !body?.amount || !body?.asset) {
      return reply.code(400).send({ error: 'Invalid request payload' });
    }

    const convertTo = typeof body.convertTo === 'string' ? body.convertTo : undefined;
    const fxQuote = convertTo
      ? await fxClient.getQuote(
          {
            from: String(body.asset),
            to: convertTo,
            amount: String(body.amount),
          },
          request.headers,
        )
      : null;

    const payment: FakePayment = {
      id: `pay_${store.length + 1}`,
      merchantId: String(body.merchantId),
      payerId: body.payerId ? String(body.payerId) : undefined,
      amount: String(body.amount),
      asset: String(body.asset),
      status: 'initiated',
      reference: body.reference ? String(body.reference) : undefined,
    };
    store.push(payment);

    return reply.code(201).send(convertTo ? { ...payment, fxQuote } : payment);
  });

  return { app, store };
}

test('POST /api/payments fetches an FX quote when convertTo is provided', async (t) => {
  let quoteRequest: { from: string; to: string; amount: string } | undefined;
  const { app } = buildApp({
    getQuote: async (request) => {
      quoteRequest = request;
      return { quoteId: 'quote_1', result: '15455.0000' };
    },
  });

  const res = await app.inject({
    method: 'POST',
    url: '/api/payments',
    payload: {
      merchantId: 'merch_1',
      amount: '10.00',
      asset: 'USDC',
      convertTo: 'NGN',
    },
  });

  const body = JSON.parse(res.body);
  t.equal(res.statusCode, 201, 'creates the payment');
  t.same(quoteRequest, { from: 'USDC', to: 'NGN', amount: '10.00' }, 'requests the matching quote');
  t.equal(body.fxQuote.quoteId, 'quote_1', 'includes the quote in the response');

  await app.close();
  t.end();
});

test('POST /api/payments does not call FX when convertTo is absent', async (t) => {
  let calls = 0;
  const { app } = buildApp({
    getQuote: async () => {
      calls += 1;
      return { quoteId: 'quote_1' };
    },
  });

  const res = await app.inject({
    method: 'POST',
    url: '/api/payments',
    payload: {
      merchantId: 'merch_1',
      amount: '10.00',
      asset: 'USDC',
    },
  });

  const body = JSON.parse(res.body);
  t.equal(res.statusCode, 201, 'creates the payment');
  t.equal(calls, 0, 'does not call fx-engine');
  t.notOk('fxQuote' in body, 'preserves the legacy response shape');

  await app.close();
  t.end();
});

test('POST /api/payments still creates payment when FX quote is unavailable', async (t) => {
  const { app } = buildApp({
    getQuote: async () => null,
  });

  const res = await app.inject({
    method: 'POST',
    url: '/api/payments',
    payload: {
      merchantId: 'merch_1',
      amount: '10.00',
      asset: 'USDC',
      convertTo: 'EURT',
    },
  });

  const body = JSON.parse(res.body);
  t.equal(res.statusCode, 201, 'creates the payment despite quote failure');
  t.equal(body.fxQuote, null, 'surfaces graceful fallback in the response');
  t.equal(body.status, 'initiated', 'payment remains initiated');

  await app.close();
  t.end();
});
