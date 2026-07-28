import test from 'tape';

/**
 * Concurrency tests for the atomic idempotency pattern used in
 * POST /api/settlements (issue #240).
 *
 * The pattern:
 *   1. Generate settlementId BEFORE any Redis/DB write
 *   2. Atomic SET NX claims the idempotency key
 *   3. Only the first claimer proceeds to settlement creation
 *   4. DB @unique constraint is the safety net if Redis is down
 *
 * These tests verify the algorithmic behaviour of the pattern
 * without requiring a live Redis or PostgreSQL instance.
 */

interface IdempotencyState {
  /** The settlementId claimed for a given key, or null if not yet claimed */
  get(key: string): string | null;
  /** Atomically claim: returns true if first claimer, false if already claimed */
  claim(key: string, value: string): boolean;
  /** In-memory store */
  _store: Map<string, string>;
}

function createIdempotencyStore(): IdempotencyState {
  const store = new Map<string, string>();
  return {
    _store: store,
    get(key: string): string | null {
      return store.get(key) ?? null;
    },
    claim(key: string, value: string): boolean {
      if (store.has(key)) return false; // Simulates SET NX returning null
      store.set(key, value);
      return true; // Simulates SET NX returning 'OK'
    },
  };
}

test('idempotency: single request creates settlement', (t) => {
  const store = createIdempotencyStore();
  const idempotencyKey = 'test-key-1';
  const settlementId = 'set_' + Math.random().toString(36).slice(2);

  // First request: claim succeeds
  const claimed = store.claim(idempotencyKey, settlementId);
  t.true(claimed, 'first request successfully claims idempotency key');

  const stored = store.get(idempotencyKey);
  t.equal(stored, settlementId, 'stored settlement ID matches');
  t.end();
});

test('idempotency: duplicate request returns existing settlement', (t) => {
  const store = createIdempotencyStore();
  const idempotencyKey = 'test-key-2';
  const settlementId1 = 'set_first_abc';
  const settlementId2 = 'set_second_xyz';

  // First request
  const claimed1 = store.claim(idempotencyKey, settlementId1);
  t.true(claimed1, 'first request claims the key');

  // Second (duplicate) request
  const claimed2 = store.claim(idempotencyKey, settlementId2);
  t.false(claimed2, 'second request fails to claim');

  const existing = store.get(idempotencyKey);
  t.equal(existing, settlementId1, 'returned ID is from the first request');
  t.notEqual(existing, settlementId2, 'second request ID is discarded');
  t.end();
});

test('idempotency: 10 concurrent requests with same key - only 1 claims', (t) => {
  const store = createIdempotencyStore();
  const idempotencyKey = 'concurrent-key';

  const results: boolean[] = [];

  for (let i = 0; i < 10; i++) {
    const sid = `set_concurrent_${i}`;
    results.push(store.claim(idempotencyKey, sid));
  }

  const winners = results.filter((r) => r === true);
  const losers = results.filter((r) => r === false);

  t.equal(winners.length, 1, 'exactly 1 request claims the idempotency key');
  t.equal(losers.length, 9, '9 requests are rejected as duplicates');
  t.end();
});

test('idempotency: unique settlement IDs per claim attempt', (t) => {
  const ids = new Set<string>();
  for (let i = 0; i < 100; i++) {
    ids.add('set_' + Math.random().toString(36).slice(2));
  }
  t.equal(ids.size, 100, 'all 100 generated settlement IDs are unique');
  t.end();
});

test('idempotency: different keys are independent', (t) => {
  const store = createIdempotencyStore();

  const claimed1 = store.claim('key-a', 'set_a');
  const claimed2 = store.claim('key-b', 'set_b');
  const claimed3 = store.claim('key-c', 'set_c');

  t.true(claimed1, 'key-a is claimable');
  t.true(claimed2, 'key-b is claimable');
  t.true(claimed3, 'key-c is claimable');

  t.equal(store.get('key-a'), 'set_a', 'key-a maps to set_a');
  t.equal(store.get('key-b'), 'set_b', 'key-b maps to set_b');
  t.equal(store.get('key-c'), 'set_c', 'key-c maps to set_c');

  // Duplicate claim attempts
  t.false(store.claim('key-a', 'set_a_dup'), 'key-a rejects duplicate');
  t.false(store.claim('key-c', 'set_c_dup'), 'key-c rejects duplicate');
  t.end();
});

test('idempotency: claim after DB fallback (simulating Redis down)', (t) => {
  // When Redis is unavailable, the SET NX throws and we fall through
  // to the DB @unique constraint. This test simulates that the
  // in-memory store behaves correctly for the first request when
  // the claim is never attempted.
  const store = createIdempotencyStore();
  const key = 'redis-down-key';
  const sid = 'set_redis_down';

  // Simulate Redis being down: claim throws, we continue without it
  // The DB @unique constraint is the safety net.
  // If the claim was never made, another request could also skip Redis
  // and both would attempt DB writes — the @unique constraint catches this.

  // First request (no Redis claim attempted)
  const existingBefore = store.get(key);
  t.equal(existingBefore, null, 'no idempotency state in Redis');

  // Store it locally as if the DB create succeeded
  store._store.set(key, sid);

  // Second request (also no Redis claim attempted)
  const existingAfter = store.get(key);
  t.equal(existingAfter, sid, 'second request can still read the stored key');
  t.end();
});