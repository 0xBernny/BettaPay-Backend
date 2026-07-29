import test from 'tape';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, {
    max: 500,
    timeWindow: '1 minute',
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });

  app.get('/api/health', async () => ({ status: 'ok' }));
  app.route({
    method: ['GET', 'POST'],
    url: '/api/events/replay',
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    handler: async (_request, reply) => reply.code(200).send({ replayed: true }),
  });

  await app.ready();
  return app;
}

test('Indexer rate limiting - requests below the limit succeed', async (t) => {
  const app = await buildApp();

  try {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health',
      remoteAddress: '127.0.0.30',
    });
    t.equal(res.statusCode, 200, 'Requests below limit should succeed (200)');
    const body = JSON.parse(res.body);
    t.equal(body.status, 'ok', 'Should return ok status');
  } catch (err: any) {
    t.fail(err);
  } finally {
    await app.close();
    t.end();
  }
});

test('Indexer rate limiting - replay endpoint override strict limit (60 requests/min)', async (t) => {
  const app = await buildApp();

  try {
    const ip = '127.0.0.40';

    for (let i = 0; i < 60; i++) {
      const res = await app.inject({ method: 'POST', url: '/api/events/replay', remoteAddress: ip });
      t.equal(res.statusCode, 200, 'Replay request ' + (i + 1) + ' below or at limit should succeed (200)');
    }

    const resOver = await app.inject({ method: 'POST', url: '/api/events/replay', remoteAddress: ip });
    t.equal(resOver.statusCode, 429, '61st request to replay endpoint should return 429 Too Many Requests');
    const body = JSON.parse(resOver.body);
    t.match(body.message, /Rate limit exceeded|Too Many Requests/i, 'Error message should indicate rate limit exceeded');
  } catch (err: any) {
    t.fail(err);
  } finally {
    await app.close();
    t.end();
  }
});

test('Indexer rate limiting - global limit (500 requests/min)', async (t) => {
  const app = await buildApp();

  try {
    const ip = '127.0.0.50';
    const requests = [];
    for (let i = 0; i < 500; i++) {
      requests.push(app.inject({ method: 'GET', url: '/api/health', remoteAddress: ip }));
    }

    const responses = await Promise.all(requests);
    for (let i = 0; i < 500; i++) {
      t.equal(responses[i].statusCode, 200, 'Global request ' + (i + 1) + ' should succeed (200)');
    }

    const resOver = await app.inject({ method: 'GET', url: '/api/health', remoteAddress: ip });
    t.equal(resOver.statusCode, 429, '501st request to global endpoint should return 429 Too Many Requests');
  } catch (err: any) {
    t.fail(err);
  } finally {
    await app.close();
    t.end();
  }
});
