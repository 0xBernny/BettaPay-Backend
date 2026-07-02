import test from 'tape';
import Fastify from 'fastify';
import { createServiceAuth, registerServiceAuth } from '@bettapay/validation';

const SECRET = 'inter-service-secret-value';

function buildApp() {
  const app = Fastify({ logger: false });
  registerServiceAuth(app, SECRET);
  app.get('/internal', { preValidation: [app.serviceAuth] }, async () => ({ ok: true }));
  return app;
}

test('serviceAuth rejects requests with no x-service-token (401)', async (t) => {
  const app = buildApp();
  const res = await app.inject({ method: 'GET', url: '/internal' });
  t.equal(res.statusCode, 401, 'missing token is unauthorized');
  t.equal(JSON.parse(res.body).error.code, 'UNAUTHORIZED', 'returns UNAUTHORIZED error code');
  await app.close();
  t.end();
});

test('serviceAuth rejects an incorrect token (401)', async (t) => {
  const app = buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/internal',
    headers: { 'x-service-token': 'wrong-token' },
  });
  t.equal(res.statusCode, 401, 'wrong token is unauthorized');
  await app.close();
  t.end();
});

test('serviceAuth accepts the correct token', async (t) => {
  const app = buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/internal',
    headers: { 'x-service-token': SECRET },
  });
  t.equal(res.statusCode, 200, 'valid token is accepted');
  t.equal(JSON.parse(res.body).ok, true, 'handler runs');
  await app.close();
  t.end();
});

test('serviceAuth rejects a token of a different length (no length leak)', async (t) => {
  const app = buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/internal',
    headers: { 'x-service-token': SECRET + 'extra' },
  });
  t.equal(res.statusCode, 401, 'length mismatch is unauthorized');
  await app.close();
  t.end();
});

test('createServiceAuth throws when given an empty secret', (t) => {
  t.throws(() => createServiceAuth(''), /non-empty INTER_SERVICE_SECRET/, 'fails fast on empty secret');
  t.end();
});
