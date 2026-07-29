import test from 'tape';
import Fastify from 'fastify';
import { registerServiceAuth } from '@bettapay/validation';
import { sendWebhookTest } from './webhook-test.js';

interface TestSubscription {
  id: string;
  url: string;
  lastTestedAt?: Date;
  lastTestStatus?: string;
  lastTestStatusCode?: number | null;
}

function buildApp(fetchFn: typeof fetch) {
  const app = Fastify({ logger: false });
  const subscriptions = new Map<string, TestSubscription>();
  registerServiceAuth(app, 'test-service-secret-value');

  app.post<{ Params: { id: string } }>(
    '/api/webhooks/:id/test',
    { preValidation: [app.serviceAuth] },
    async (request, reply) => {
      const subscription = subscriptions.get(request.params.id);
      if (!subscription) {
        return reply.code(404).send({
          error: { code: 'NOT_FOUND', message: 'Webhook subscription ' + request.params.id + ' not found' },
        });
      }

      const testedAt = new Date('2026-07-29T12:00:00.000Z');
      const result = await sendWebhookTest(subscription, { fetchFn, now: testedAt });
      subscription.lastTestedAt = testedAt;
      subscription.lastTestStatus = result.success ? 'success' : 'failed';
      subscription.lastTestStatusCode = result.statusCode ?? null;
      return reply.send(result);
    }
  );

  return { app, subscriptions };
}

test('webhook test succeeds and stores result when mock server returns 200', async (t) => {
  let payload: any;
  const fetchFn: typeof fetch = async (_url, init) => {
    payload = JSON.parse(String(init?.body));
    return new Response('', { status: 200 });
  };
  const { app, subscriptions } = buildApp(fetchFn);
  subscriptions.set('wh_1', { id: 'wh_1', url: 'https://example.com/webhook' });

  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/wh_1/test',
      headers: { 'x-service-token': 'test-service-secret-value' },
    });

    t.equal(res.statusCode, 200, 'endpoint returns 200');
    const body = JSON.parse(res.body);
    t.equal(body.success, true, 'test result succeeds');
    t.equal(body.statusCode, 200, 'stores response status code');
    t.equal(payload.type, 'test', 'sends test payload type');
    t.equal(payload.subscriptionId, 'wh_1', 'sends subscription id');
    t.equal(payload.test, true, 'marks payload as test');
    t.ok(payload.timestamp, 'sends timestamp');
    t.equal(subscriptions.get('wh_1')?.lastTestStatus, 'success', 'stores success status');
    t.equal(subscriptions.get('wh_1')?.lastTestStatusCode, 200, 'stores success status code');
  } finally {
    await app.close();
    t.end();
  }
});

test('webhook test fails and stores result when mock server returns 500', async (t) => {
  const fetchFn: typeof fetch = async () => new Response('', { status: 500 });
  const { app, subscriptions } = buildApp(fetchFn);
  subscriptions.set('wh_2', { id: 'wh_2', url: 'https://example.com/webhook' });

  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/wh_2/test',
      headers: { 'x-service-token': 'test-service-secret-value' },
    });

    t.equal(res.statusCode, 200, 'endpoint returns delivery result');
    const body = JSON.parse(res.body);
    t.equal(body.success, false, 'test result fails');
    t.equal(body.statusCode, 500, 'returns failing status code');
    t.equal(body.error, 'HTTP 500', 'returns HTTP error message');
    t.equal(subscriptions.get('wh_2')?.lastTestStatus, 'failed', 'stores failed status');
    t.equal(subscriptions.get('wh_2')?.lastTestStatusCode, 500, 'stores failed status code');
  } finally {
    await app.close();
    t.end();
  }
});

test('webhook test fails without status code for unreachable URL', async (t) => {
  const fetchFn: typeof fetch = async () => {
    throw new Error('connect ECONNREFUSED');
  };
  const { app, subscriptions } = buildApp(fetchFn);
  subscriptions.set('wh_3', { id: 'wh_3', url: 'https://example.com/webhook' });

  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/wh_3/test',
      headers: { 'x-service-token': 'test-service-secret-value' },
    });

    t.equal(res.statusCode, 200, 'endpoint returns delivery result');
    const body = JSON.parse(res.body);
    t.equal(body.success, false, 'test result fails');
    t.notOk('statusCode' in body, 'does not return status code');
    t.equal(body.error, 'connect ECONNREFUSED', 'returns connection error');
    t.equal(subscriptions.get('wh_3')?.lastTestStatus, 'failed', 'stores failed status');
    t.equal(subscriptions.get('wh_3')?.lastTestStatusCode, null, 'stores null status code');
  } finally {
    await app.close();
    t.end();
  }
});

test('webhook test returns 404 for non-existent subscription', async (t) => {
  const fetchFn: typeof fetch = async () => new Response('', { status: 200 });
  const { app } = buildApp(fetchFn);

  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/webhooks/missing/test',
      headers: { 'x-service-token': 'test-service-secret-value' },
    });

    t.equal(res.statusCode, 404, 'missing subscription returns 404');
  } finally {
    await app.close();
    t.end();
  }
});
