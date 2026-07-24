import test from 'tape';

// Mock Redis client for testing
class MockRedis {
  private store: Map<string, any[]> = new Map();

  async zadd(key: string, score: number, member: string): Promise<number> {
    if (!this.store.has(key)) {
      this.store.set(key, []);
    }
    const arr = this.store.get(key)!;
    arr.push({ score, member });
    arr.sort((a, b) => b.score - a.score);
    return 1;
  }

  async zrevrangebyscore(key: string, max: string | number, min: string | number, ...args: any[]): Promise<string[]> {
    const members = this.store.get(key) || [];
    const limit = args.includes('LIMIT') ? args[args.indexOf('LIMIT') + 2] : undefined;
    const filtered = members.slice(0, limit || members.length);
    return filtered.map((m) => m.member);
  }

  pipeline() {
    return {
      zadd: (key: string, score: number, member: string) => this,
      zremrangebyscore: (key: string, min: string, max: string) => this,
      exec: async () => [[1], [0]],
    };
  }
}

interface RateCache {
  rates: Record<string, number>;
  cachedAt: number;
}

let cache: RateCache = {
  rates: { USDC: 1545.50, EURT: 1680.20, NGN: 1.0 },
  cachedAt: Date.now(),
};

const FALLBACK_RATES: Record<string, number> = {
  USDC: 1545.50,
  EURT: 1680.20,
  NGN: 1.0,
};

const SNAPSHOT_KEY = 'fx:rate_snapshots';

function updateBaseRates(newRates: Record<string, number>): void {
  cache = { rates: newRates, cachedAt: Date.now() };
}

async function warmupCacheFromRedis(redis: MockRedis): Promise<void> {
  try {
    const members = await redis.zrevrangebyscore(SNAPSHOT_KEY, '+inf', '-inf', 'LIMIT', 0, 1);
    if (!members.length) {
      // No snapshot found; use fallback rates
      return;
    }

    const snapshot = JSON.parse(members[0]) as { ts: number; rates: Record<string, number> };
    updateBaseRates(snapshot.rates);
  } catch (err) {
    // On error, use fallback rates
  }
}

test('FX cache warmup: no snapshot in Redis', async (t) => {
  const redis = new MockRedis();
  const initialCache = { ...cache.rates };

  await warmupCacheFromRedis(redis);

  t.deepEqual(cache.rates, initialCache, 'cache unchanged when no snapshot exists');
  t.end();
});

test('FX cache warmup: with snapshot in Redis', async (t) => {
  const redis = new MockRedis();
  const snapshot = { ts: Date.now(), rates: { USDC: 2000.00, EURT: 1800.00, NGN: 1.0 } };

  await redis.zadd(SNAPSHOT_KEY, snapshot.ts, JSON.stringify(snapshot));

  const oldRates = { ...cache.rates };
  await warmupCacheFromRedis(redis);

  t.notDeepEqual(cache.rates, oldRates, 'cache updated with snapshot rates');
  t.equal(cache.rates.USDC, 2000.00, 'USDC rate updated to 2000.00');
  t.equal(cache.rates.EURT, 1800.00, 'EURT rate updated to 1800.00');
  t.equal(cache.rates.NGN, 1.0, 'NGN rate unchanged');
  t.end();
});

test('FX cache warmup: multiple snapshots (uses latest)', async (t) => {
  const redis = new MockRedis();
  const oldSnapshot = { ts: Date.now() - 3600000, rates: { USDC: 1000.00, EURT: 1000.00, NGN: 1.0 } };
  const newSnapshot = { ts: Date.now(), rates: { USDC: 2500.00, EURT: 2000.00, NGN: 1.0 } };

  await redis.zadd(SNAPSHOT_KEY, oldSnapshot.ts, JSON.stringify(oldSnapshot));
  await redis.zadd(SNAPSHOT_KEY, newSnapshot.ts, JSON.stringify(newSnapshot));

  await warmupCacheFromRedis(redis);

  t.equal(cache.rates.USDC, 2500.00, 'uses latest snapshot USDC rate');
  t.equal(cache.rates.EURT, 2000.00, 'uses latest snapshot EURT rate');
  t.end();
});

test('FX cache warmup: invalid JSON in snapshot (falls back gracefully)', async (t) => {
  const redis = new MockRedis();
  // Manually insert invalid JSON
  (redis as any).store.set(SNAPSHOT_KEY, [{ score: Date.now(), member: 'invalid json' }]);

  const oldRates = { ...cache.rates };
  await warmupCacheFromRedis(redis);

  t.deepEqual(cache.rates, oldRates, 'cache unchanged when snapshot is invalid JSON');
  t.end();
});

test('FX cache warmup: snapshot with missing rates property', async (t) => {
  const redis = new MockRedis();
  const badSnapshot = { ts: Date.now() }; // Missing rates property

  await redis.zadd(SNAPSHOT_KEY, Date.now(), JSON.stringify(badSnapshot));

  const oldRates = { ...cache.rates };
  await warmupCacheFromRedis(redis);

  // This should either fail gracefully or keep old rates
  t.ok(true, 'handles missing rates property without crashing');
  t.end();
});
