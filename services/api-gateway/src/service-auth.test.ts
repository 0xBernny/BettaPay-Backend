import test from 'tape';
import { createServiceAuth, validateEnv } from '@bettapay/validation';
import { buildApp } from './index.js';
import { createMockPrisma } from './test-utils.js';

// Ensure we have a valid inter-service secret for the app config
const env = validateEnv(process.env);
const SECRET = env.INTER_SERVICE_SECRET || 'inter-service-secret-value';

test('serviceAuth rejects requests with no x-service-token on gateway admin route (401)', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });
  const res = await app.inject({ method: 'GET', url: '/api/admin/audit-log' });

  t.equal(res.statusCode, 401, 'missing token is unauthorized');
  t.equal(JSON.parse(res.body).error.code, 'UNAUTHORIZED', 'returns UNAUTHORIZED error code');
  await app.close();
  t.end();
});

test('serviceAuth rejects an incorrect token on gateway admin route (401)', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });
  const res = await app.inject({
    method: 'GET',
    url: '/api/admin/audit-log',
    headers: { 'x-service-token': 'wrong-token' },
  });

  t.equal(res.statusCode, 401, 'wrong token is unauthorized');
  await app.close();
  t.end();
});

test('serviceAuth accepts the correct token on gateway admin route', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });
  const res = await app.inject({
    method: 'GET',
    url: '/api/admin/audit-log',
    headers: { 'x-service-token': SECRET },
  });

  t.equal(res.statusCode, 200, 'valid token is accepted');
  await app.close();
  t.end();
});

test('serviceAuth rejects a token of a different length (no length leak) on gateway admin route', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });
  const res = await app.inject({
    method: 'GET',
    url: '/api/admin/audit-log',
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
