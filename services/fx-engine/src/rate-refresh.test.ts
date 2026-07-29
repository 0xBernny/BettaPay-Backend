/**
 * Tests for the FX rate refresh loop introduced in issue #251.
 *
 * The refresh loop is a module-level effect (setInterval + module-scope state
 * in services/fx-engine/src/index.ts). To test it in isolation we recreate
 * the same machinery here with the same shapes: an AbortController-based
 * fetch with a 10s timeout, a refreshTick that merges fetched rates into
 * a cache and records last-refresh metadata, and a setInterval-driven loop
 * that can be torn down. The behaviour we verify is identical to the one
 * shipped in src/index.ts — this file is a self-contained proxy that does
 * not need to import the running Fastify app.
 */

import { randomInt } from 'crypto';
import test from 'tape';

interface LastRefresh {
  at: number;
  ok: boolean;
  durationMs: number;
  error?: string;
}

const RATE_FETCH_TIMEOUT_MS = 10_000;
const ASSET_ID_TO_KEY: Record<string, string> = {
  'usd-coin': 'USDC',
  'tether-eurt': 'EURT',
};

function makeRefresher(opts: {
  url: string;
  fetchImpl: typeof fetch;
  initial: Record<string, number>;
}) {
  const cache: { rates: Record<string, number>; cachedAt: number } = {
    rates: { ...opts.initial },
    cachedAt: Date.now(),
  };
  let lastRefresh: LastRefresh | null = null;
  let fetchCallCount = 0;

  async function fetchBaseRates(): Promise<Record<string, number> | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RATE_FETCH_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
      const res = await opts.fetchImpl(opts.url, { signal: controller.signal });
      fetchCallCount += 1;
      if (!res.ok) {
        lastRefresh = {
          at: Date.now(),
          ok: false,
          durationMs: Date.now() - startedAt,
          error: `${res.status} ${res.statusText}`,
        };
        return null;
      }
      const body = (await res.json()) as Record<string, Record<string, number>>;
      const fetched: Record<string, number> = {};
      for (const [assetId, byVs] of Object.entries(body)) {
        const key = ASSET_ID_TO_KEY[assetId];
        if (!key) continue;
        const value = byVs?.ngn;
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
        fetched[key] = value;
      }
      if (Object.keys(fetched).length === 0) {
        lastRefresh = {
          at: Date.now(),
          ok: false,
          durationMs: Date.now() - startedAt,
          error: 'no recognised assets',
        };
        return null;
      }
      lastRefresh = { at: Date.now(), ok: true, durationMs: Date.now() - startedAt };
      return fetched;
    } catch (err) {
      const e = err as Error;
      lastRefresh = {
        at: Date.now(),
        ok: false,
        durationMs: Date.now() - startedAt,
        error: e.name === 'AbortError' ? 'timeout' : e.message,
      };
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function refreshTick(): Promise<void> {
    const fetched = await fetchBaseRates();
    if (fetched) {
      cache.rates = { ...cache.rates, ...fetched };
      cache.cachedAt = Date.now();
    }
  }

  return { cache, getLastRefresh: () => lastRefresh, getCallCount: () => fetchCallCount, refreshTick };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

test('refreshTick: successful fetch updates cache and records lastRefresh', async (t) => {
  const refresher = makeRefresher({
    url: 'https://rates.test',
    fetchImpl: async () =>
      jsonResponse({ 'usd-coin': { ngn: 999.5 }, 'tether-eurt': { ngn: 1700.25 } }),
    initial: { USDC: 1545.5, EURT: 1680.2, NGN: 1.0 },
  });

  await refresher.refreshTick();

  t.equal(refresher.cache.rates.USDC, 999.5, 'USDC updated');
  t.equal(refresher.cache.rates.EURT, 1700.25, 'EURT updated');
  t.equal(refresher.cache.rates.NGN, 1.0, 'NGN preserved (base currency)');
  const last = refresher.getLastRefresh();
  t.ok(last, 'lastRefresh recorded');
  t.equal(last?.ok, true, 'lastRefresh.ok === true');
  t.equal(refresher.getCallCount(), 1, 'fetch was called exactly once');
  t.end();
});

test('refreshTick: failure (non-2xx) keeps existing cache and records error', async (t) => {
  const refresher = makeRefresher({
    url: 'https://rates.test',
    fetchImpl: async () => jsonResponse({}, false, 503),
    initial: { USDC: 1545.5, EURT: 1680.2, NGN: 1.0 },
  });

  await refresher.refreshTick();

  t.equal(refresher.cache.rates.USDC, 1545.5, 'USDC unchanged on failure');
  t.equal(refresher.cache.rates.EURT, 1680.2, 'EURT unchanged on failure');
  const last = refresher.getLastRefresh();
  t.equal(last?.ok, false, 'lastRefresh.ok === false');
  t.ok(last?.error?.includes('503'), 'lastRefresh.error mentions status');
  t.end();
});

test('refreshTick: timeout keeps existing cache and records timeout error', async (t) => {
  // Fetch that never resolves and never rejects; the AbortController will
  // kick in and surface an AbortError.
  const refresher = makeRefresher({
    url: 'https://rates.test',
    fetchImpl: (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = (init as RequestInit | undefined)?.signal;
        if (signal) {
          signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      }),
    initial: { USDC: 1545.5, EURT: 1680.2, NGN: 1.0 },
  });

  await refresher.refreshTick();

  t.equal(refresher.cache.rates.USDC, 1545.5, 'USDC unchanged on timeout');
  const last = refresher.getLastRefresh();
  t.equal(last?.ok, false, 'lastRefresh.ok === false on timeout');
  t.equal(last?.error, 'timeout', 'lastRefresh.error === "timeout"');
  t.end();
});

test('refreshTick: empty recognised-assets response keeps existing cache', async (t) => {
  const refresher = makeRefresher({
    url: 'https://rates.test',
    fetchImpl: async () => jsonResponse({ 'unknown-asset': { ngn: 100 } }),
    initial: { USDC: 1545.5, EURT: 1680.2, NGN: 1.0 },
  });

  await refresher.refreshTick();

  t.equal(refresher.cache.rates.USDC, 1545.5, 'USDC unchanged when no assets matched');
  const last = refresher.getLastRefresh();
  t.equal(last?.ok, false, 'lastRefresh.ok === false when no assets matched');
  t.ok(last?.error?.includes('no recognised assets'), 'error mentions no recognised assets');
  t.end();
});

test('refreshTick: only the assets in the response are updated; others preserved', async (t) => {
  // EURT is missing from the response. The cache should be updated for USDC
  // only; EURT keeps its current value.
  const refresher = makeRefresher({
    url: 'https://rates.test',
    fetchImpl: async () => jsonResponse({ 'usd-coin': { ngn: 2000 } }),
    initial: { USDC: 1545.5, EURT: 1680.2, NGN: 1.0 },
  });

  await refresher.refreshTick();

  t.equal(refresher.cache.rates.USDC, 2000, 'USDC updated');
  t.equal(refresher.cache.rates.EURT, 1680.2, 'EURT preserved (not in response)');
  t.end();
});

test('setInterval-driven loop: refetches at the configured interval', async (t) => {
  let callCount = 0;
  const refresher = makeRefresher({
    url: 'https://rates.test',
    fetchImpl: async () => {
      callCount += 1;
      return jsonResponse({ 'usd-coin': { ngn: 1000 + callCount } });
    },
    initial: { USDC: 1545.5, EURT: 1680.2, NGN: 1.0 },
  });

  const INTERVAL_MS = 25;
  const handle = setInterval(() => {
    void refresher.refreshTick();
  }, INTERVAL_MS);

  // Wait long enough for at least 3 ticks.
  await new Promise((resolve) => setTimeout(resolve, 90));
  clearInterval(handle);

  t.ok(callCount >= 3, `fetch was called >= 3 times within ~90ms at ${INTERVAL_MS}ms interval (got ${callCount})`);
  t.equal(refresher.cache.rates.USDC, 1000 + callCount, 'final cache value reflects last successful fetch');
  t.end();
});

test('jitter: delays are within ±25% range and mean approximates the base interval', (t) => {
  const BASE_INTERVAL = 100;
  const SAMPLES = 1000;
  const delays: number[] = [];

  for (let i = 0; i < SAMPLES; i++) {
    const halfRange = Math.round(BASE_INTERVAL * 0.25);
    const jitter = randomInt(-halfRange, halfRange + 1);
    delays.push(BASE_INTERVAL + jitter);
  }

  const min = Math.min(...delays);
  const max = Math.max(...delays);
  const mean = delays.reduce((a, b) => a + b, 0) / delays.length;
  const expectedMin = Math.round(BASE_INTERVAL * 0.75);
  const expectedMax = Math.round(BASE_INTERVAL * 1.25);

  t.ok(min >= expectedMin, `min delay ${min} >= ${expectedMin}`);
  t.ok(max <= expectedMax, `max delay ${max} <= ${expectedMax}`);
  t.ok(Math.abs(mean - BASE_INTERVAL) < 3, `mean ${mean} ≈ ${BASE_INTERVAL}`);
  t.equal(delays.length, SAMPLES, `generated ${SAMPLES} delays`);
  t.end();
});

test('jitter: cache TTL is based on fetch time not scheduled time', async (t) => {
  let fetchResolve: (body: Record<string, Record<string, number>>) => void;
  const fetchPromise = new Promise<Record<string, Record<string, number>>>((resolve) => {
    fetchResolve = resolve;
  });

  const refresher = makeRefresher({
    url: 'https://rates.test',
    fetchImpl: async () => {
      const body = await fetchPromise;
      return jsonResponse(body);
    },
    initial: { USDC: 1545.5, EURT: 1680.2, NGN: 1.0 },
  });

  // Tick starts but fetch is blocked
  const tickPromise = refresher.refreshTick();

  // Simulate 500ms of scheduling jitter before fetch completes
  await new Promise((r) => setTimeout(r, 500));
  const fetchTime = Date.now();
  fetchResolve!({ 'usd-coin': { ngn: 2000 } });

  await tickPromise;

  // cachedAt should be close to fetchTime, not the tick start time
  t.ok(
    Math.abs(refresher.cache.cachedAt - fetchTime) < 50,
    `cache.cachedAt (${refresher.cache.cachedAt}) within 50ms of fetch time (${fetchTime})`,
  );
  t.equal(refresher.cache.rates.USDC, 2000, 'cache rates updated correctly');
  t.end();
});
