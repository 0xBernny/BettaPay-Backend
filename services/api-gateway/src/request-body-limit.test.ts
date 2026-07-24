import test from 'tape';
import { buildApp } from './index.js';
import { createMockPrisma } from './test-utils.js';

const BODY_LIMIT = 1_048_576;

test('Fastify uses the configured request body size limits on gateway app', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });
  t.equal(app.initialConfig.bodyLimit, 1_048_576, 'bodyLimit is configured to exactly 1,048,576 bytes (1MB)');
  await app.close();
  t.end();
});

test('payload above limit is rejected with HTTP 413 on gateway app', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });
  const payload = 'a'.repeat(BODY_LIMIT + 1);

  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/token',
    headers: {
      'content-type': 'application/json',
    },
    payload,
  });

  t.equal(response.statusCode, 413, 'returns 413 Payload Too Large');
  const body = JSON.parse(response.body);
  t.equal(body.error, 'Payload Too Large', 'error name is Payload Too Large');

  await app.close();
  t.end();
});
