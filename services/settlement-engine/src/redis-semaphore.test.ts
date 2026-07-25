import test from 'tape';
import { acquireSemaphore, releaseSemaphore, getActiveCount } from './redis-semaphore.js';

// Minimal in-memory Redis mock that supports the sorted set operations
// used by the semaphore implementation.
function createMockRedis() {
  const store: Record<string, { score: number; member: string }[]> = {};
  const ttls: Record<string, number> = {};

  return {
    store,
    async zremrangebyscore(key: string, min: number, max: number) {
      if (!store[key]) return 0;
      const before = store[key].length;
      store[key] = store[key].filter(e => e.score < min || e.score > max);
      return before - store[key].length;
    },
    async zcard(key: string) {
      return (store[key] ?? []).length;
    },
    async zadd(key: string, score: number, member: string) {
      if (!store[key]) store[key] = [];
      store[key].push({ score, member });
      store[key].sort((a, b) => a.score - b.score);
      return 1;
    },
    async expire(key: string, ttl: number) {
      ttls[key] = ttl;
      return 1;
    },
    async zpopmin(key: string, count: number) {
      if (!store[key]) return [];
      const removed = store[key].splice(0, count);
      return removed.map(e => [e.member, e.score.toString()]);
    },
    async del(key: string) {
      delete store[key];
      delete ttls[key];
      return 1;
    },
  };
}

test('acquireSemaphore: succeeds when slots available', async (t) => {
  const redis = createMockRedis() as any;
  const acquired = await acquireSemaphore(redis, 'merchant-1', { maxConcurrent: 3 });
  t.ok(acquired, 'should acquire when under limit');
  t.equal(redis.store['semaphore:settlement:merchant-1'].length, 1, 'one slot consumed');
  t.end();
});

test('acquireSemaphore: fails when at capacity', async (t) => {
  const redis = createMockRedis() as any;
  // Fill all 3 slots
  await acquireSemaphore(redis, 'merchant-1', { maxConcurrent: 3 });
  await acquireSemaphore(redis, 'merchant-1', { maxConcurrent: 3 });
  await acquireSemaphore(redis, 'merchant-1', { maxConcurrent: 3 });

  const acquired = await acquireSemaphore(redis, 'merchant-1', { maxConcurrent: 3 });
  t.notOk(acquired, 'should fail when at capacity');
  t.end();
});

test('acquireSemaphore: different merchants are independent', async (t) => {
  const redis = createMockRedis() as any;
  // Fill merchant A
  await acquireSemaphore(redis, 'merchant-A', { maxConcurrent: 2 });
  await acquireSemaphore(redis, 'merchant-A', { maxConcurrent: 2 });

  // Merchant B should still be available
  const acquired = await acquireSemaphore(redis, 'merchant-B', { maxConcurrent: 2 });
  t.ok(acquired, 'different merchant can acquire');
  t.end();
});

test('releaseSemaphore: frees one slot', async (t) => {
  const redis = createMockRedis() as any;
  await acquireSemaphore(redis, 'merchant-1', { maxConcurrent: 3 });
  await acquireSemaphore(redis, 'merchant-1', { maxConcurrent: 3 });

  t.equal(redis.store['semaphore:settlement:merchant-1'].length, 2, 'two slots before release');

  await releaseSemaphore(redis, 'merchant-1');
  t.equal(redis.store['semaphore:settlement:merchant-1'].length, 1, 'one slot after release');
  t.end();
});

test('releaseSemaphore: cleans up empty key', async (t) => {
  const redis = createMockRedis() as any;
  await acquireSemaphore(redis, 'merchant-1', { maxConcurrent: 3 });
  t.equal(redis.store['semaphore:settlement:merchant-1'].length, 1);

  await releaseSemaphore(redis, 'merchant-1');
  t.notOk(redis.store['semaphore:settlement:merchant-1'], 'key is deleted when empty');
  t.end();
});

test('releaseSemaphore: no-op on empty key', async (t) => {
  const redis = createMockRedis() as any;
  await releaseSemaphore(redis, 'nonexistent-merchant');
  t.pass('release on empty does not throw');
  t.end();
});

test('getActiveCount: returns current count', async (t) => {
  const redis = createMockRedis() as any;
  t.equal(await getActiveCount(redis, 'merchant-1'), 0, 'zero initially');

  await acquireSemaphore(redis, 'merchant-1', { maxConcurrent: 3 });
  t.equal(await getActiveCount(redis, 'merchant-1'), 1, 'one after acquire');

  await acquireSemaphore(redis, 'merchant-1', { maxConcurrent: 3 });
  t.equal(await getActiveCount(redis, 'merchant-1'), 2, 'two after second acquire');

  await releaseSemaphore(redis, 'merchant-1');
  t.equal(await getActiveCount(redis, 'merchant-1'), 1, 'one after release');
  t.end();
});

test('acquire after release: re-acquires freed slot', async (t) => {
  const redis = createMockRedis() as any;
  const opts = { maxConcurrent: 2 };

  t.ok(await acquireSemaphore(redis, 'merchant-1', opts), 'first acquire');
  t.ok(await acquireSemaphore(redis, 'merchant-1', opts), 'second acquire');
  t.notOk(await acquireSemaphore(redis, 'merchant-1', opts), 'third fails at capacity');

  await releaseSemaphore(redis, 'merchant-1');
  t.ok(await acquireSemaphore(redis, 'merchant-1', opts), 're-acquires after release');
  t.end();
});
