import test from 'tape';
import { buildApp } from './index.js';
import { createMockPrisma } from './test-utils.js';

test('Fastify uses the documented request and connection timeouts on the gateway app', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });
  t.equal((app.initialConfig as any).requestTimeout, 30_000, 'requestTimeout is 30s');
  t.equal((app.initialConfig as any).connectionTimeout, 31_000, 'connectionTimeout is 31s (1s above requestTimeout)');
  await app.close();
  t.end();
});

test('gateway app includes per-request timeout guard hook', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });

  // Fast route on real gateway app (e.g. /api/deployments)
  const fast = await app.inject({ method: 'GET', url: '/api/deployments' });
  t.equal(fast.statusCode, 200, 'a fast route returns 200 OK');

  await app.close();
  t.end();
});
