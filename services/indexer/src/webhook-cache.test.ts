process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'a'.repeat(32);
process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
process.env.SETTLEMENT_CONTRACT_ID = 'CDLZFC3SYXDT4MMSTXTU4Z4VABMFR6SPLPNCZF656SIHPXT6LPWEEXGO';
process.env.GOVERNANCE_CONTRACT_ID = 'CBJDHFU7XYDT4MMSTXTU4Z4VABMFR6SPLPNCZF656SIHPXT6LPWEEXGO';
process.env.ADMIN_ADDRESS = 'GBJDHFU7XYDT4MMSTXTU4Z4VABMFR6SPLPNCZF656SIHPXT6LPWEEXGO';
process.env.INTER_SERVICE_SECRET = 'test-secret-that-is-at-least-16-chars';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.ADMIN_SECRET = 'test-admin-secret';
process.env.FIELD_ENCRYPTION_KEY = 'b'.repeat(32);

import test from 'tape';

const {
  persistEvent,
  fastify,
  cacheState,
  prisma,
  webhookQueue
} = await import('./index.js');

test('persistEvent caches webhook subscriptions for 30s', async (t) => {
  await fastify.ready();

  cacheState.subscriptions = null;
  
  let findManyCalls = 0;
  
  // Mock Prisma and Queue
  prisma.indexedEvent.create = async (args: any) => ({ ...args.data }) as any;
  prisma.webhookSubscription.findMany = async () => {
    findManyCalls++;
    return [] as any;
  };
  webhookQueue.add = async () => ({} as any);

  try {
    await persistEvent(null, ['test_topic'], 'test_topic', 'contract', 'contractName', 'raw', {}, 1);
    t.equal(findManyCalls, 1, 'findMany is called on first event');
    const cache1 = cacheState.subscriptions;
    t.ok(cache1 !== null, 'cache is populated after first call');
    
    const cachedAt1 = cache1!.cachedAt;

    await persistEvent(null, ['test_topic_2'], 'test_topic_2', 'contract', 'contractName', 'raw', {}, 2);
    t.equal(findManyCalls, 1, 'findMany is NOT called on second event (cache hit)');
    const cache2 = cacheState.subscriptions;
    t.equal(cache2!.cachedAt, cachedAt1, 'cachedAt timestamp remains the same (cache hit)');

    // Simulate cache expiry
    cacheState.subscriptions!.cachedAt = Date.now() - 31000;

    await persistEvent(null, ['test_topic_3'], 'test_topic_3', 'contract', 'contractName', 'raw', {}, 3);
    t.equal(findManyCalls, 2, 'findMany is called again after cache expires');
    const cache3 = cacheState.subscriptions;
    t.ok(cache3!.cachedAt > cachedAt1, 'cachedAt timestamp updated (cache miss / refresh)');
  } catch (err: any) {
    t.fail(err);
  } finally {
    t.end();
  }
});

test('webhook creation and deletion invalidate the cache', async (t) => {
  await fastify.ready();

  cacheState.subscriptions = { data: [], cachedAt: Date.now() };

  prisma.$transaction = async (fn: any) => {
    // Just execute the function, but we need to mock the tx methods
    const tx = {
      webhookSubscription: {
        create: async (args: any) => ({ ...args.data }),
        delete: async () => ({}),
      }
    };
    return fn(tx);
  };
  prisma.webhookSubscription.findUnique = async () => ({ id: 'fake_id', url: 'https://example.com' }) as any;

  try {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/webhooks',
      headers: { 'x-service-token': process.env.INTER_SERVICE_SECRET || 'test-secret-that-is-at-least-16-chars' },
      payload: { url: 'https://example.com/webhook' }
    });
    
    t.equal(res.statusCode, 201, 'POST /api/webhooks succeeds');
    t.equal(cacheState.subscriptions, null, 'Cache is null after POST /api/webhooks');

    cacheState.subscriptions = { data: [], cachedAt: Date.now() };

    const resDel = await fastify.inject({
      method: 'DELETE',
      url: '/api/webhooks/fake_id',
      headers: { 'x-service-token': process.env.INTER_SERVICE_SECRET || 'test-secret-that-is-at-least-16-chars' },
    });
    t.equal(resDel.statusCode, 204, 'DELETE /api/webhooks/:id succeeds');
    t.equal(cacheState.subscriptions, null, 'Cache is null after DELETE /api/webhooks/:id');

  } catch (err: any) {
    t.fail(err);
  } finally {
    t.end();
  }
});

test('cleanup', (t) => {
  t.end();
  process.exit(0);
});
