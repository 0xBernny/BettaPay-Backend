/**
 * FX Engine — BettaPay Backend
 *
 * Provides exchange rate quotes for currency pairs.
 * Rates are fetched from an external API at a configurable interval and
 * cached in memory with a TTL. Hardcoded defaults serve as fallback.
 *
 * Endpoints:
 *   GET  /api/rates                          — latest cached rates with cache metadata
 *   GET  /api/rates/history?from=&to=&at=  — historical rate at a given timestamp
 *   GET  /api/currencies                    — list of supported currency codes
 *   GET  /api/quote?from=&to=&amount=       — FX quote (returns quoteId for verification)
 *   POST /api/quote/verify                  — verify a quote is still valid; returns currentRate
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import * as promClient from 'prom-client';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { Redis } from 'ioredis';
import { Queue, Worker } from 'bullmq';
import {
  validateEnvOrExit,
  registerErrorHandler,
  registerRequestId,
  registerServiceAuth,
  createErrorResponse,
  ErrorCodes,
  createLoggerOptions,
  registerTracing,
  CurrencyCode,
  buildFxEngineHealthResponse,
  readServiceVersion,
  createRedisClient,
  waitForRedis,
  startRedisMemoryMonitor,
  startMetricsServer,
} from '@bettapay/validation';

const env = validateEnvOrExit(process.env);
const PORT = Number(process.env.PORT ?? '3002');
const startTime = Date.now();
const SERVICE_VERSION = readServiceVersion(import.meta.url);

// ── Fallback / seed rates (issue #47) ──────────────────────────────────────
// Used on first startup before the external API responds, and whenever the
// API is unreachable so the service degrades gracefully.

const FALLBACK_RATES: Record<string, number> = {
  USDC: 1545.50,
  EURT: 1680.20,
  NGN:  1.0,
};

const CURRENCY_DISPLAY_NAMES: Record<string, string> = {
  USDC: 'USD Coin',
  EURT: 'Euro Tether',
  NGN:  'Nigerian Naira',
};

const SUPPORTED_CURRENCIES = Object.keys(FALLBACK_RATES);

// ── In-memory rate cache (issues #47 & #48) ────────────────────────────────

interface RateCache {
  rates: Record<string, number>;
  cachedAt: number; // Unix ms timestamp
}

let cache: RateCache = {
  rates:    { ...FALLBACK_RATES },
  cachedAt: Date.now(),
};

// ── Computed pair-rate cache (issue #55) ───────────────────────────────────
// Avoids recomputing the same cross/inverse rate on every request.
// Keyed by "FROM_TO" (e.g. "USDC_EURT", "NGN_USDC").
// Entries expire after RATE_TTL_MS; the cache is also fully invalidated
// whenever base rates are refreshed via updateBaseRates().

const RATE_TTL_MS = 60_000;

interface ComputedRateEntry {
  rate:       number;
  computedAt: number;
}

const computedRateCache = new Map<string, ComputedRateEntry>();

function computeRate(from: string, to: string, baseRates: Record<string, number>): number {
  // NGN is the base (rate === 1.0), so all three cases collapse to one formula:
  //   direct  (X → NGN):  baseRates[from] / 1          = baseRates[from]
  //   inverse (NGN → X):  1              / baseRates[to]
  //   cross   (X → Y):    baseRates[from] / baseRates[to]
  return baseRates[from] / baseRates[to];
}

function getOrComputeRate(from: string, to: string): number {
  const key   = `${from}_${to}`;
  const now   = Date.now();
  const entry = computedRateCache.get(key);

  if (entry && now - entry.computedAt < RATE_TTL_MS) {
    return entry.rate;
  }

  const rate = computeRate(from, to, cache.rates);
  computedRateCache.set(key, { rate, computedAt: now });
  return rate;
}

// ── Rate history snapshots (issue #56) ───────────────────────────────────
// Snapshots are stored in a Redis Sorted Set (score = Unix ms timestamp).
// ZREVRANGEBYSCORE lets us find the closest snapshot at or before any point
// in time in O(log N). Entries older than SNAPSHOT_RETENTION_MS are pruned
// on each write.

// Assigned after Fastify is created so the error handler can use fastify.log.
// The definite-assignment assertion is safe: storeRateSnapshot is only called
// at runtime (never during synchronous module init), by which point redis is set.
let redis!: Redis;

const SNAPSHOT_KEY           = 'fx:rate_snapshots';
const SNAPSHOT_RETENTION_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days

async function storeRateSnapshot(rates: Record<string, number>): Promise<void> {
  const now    = Date.now();
  const cutoff = now - SNAPSHOT_RETENTION_MS;
  await redis
    .pipeline()
    .zadd(SNAPSHOT_KEY, now, JSON.stringify({ ts: now, rates }))
    .zremrangebyscore(SNAPSHOT_KEY, '-inf', cutoff)
    .exec();
}

function updateBaseRates(newRates: Record<string, number>): void {
  cache = { rates: newRates, cachedAt: Date.now() };
  computedRateCache.clear();
  storeRateSnapshot(newRates).catch(() => {}); // Redis errors are non-fatal
}

// ── Live rate refresh loop (issue #251) ────────────────────────────────────
//
// The external rates API (RATES_API_URL) is polled every RATES_REFRESH_INTERVAL_MS
// to keep cache.rates in sync with the source. On any failure the existing
// cache is preserved and the next interval retries — the fallback rates stay
// live until the next successful tick.
//
// The response shape is the CoinGecko `simple/price` payload:
//   { "<asset-id>": { "<vs-currency>": <price> } }
// e.g. { "usd-coin": { "ngn": 1545.5 } }
//
// We map the known asset ids to the keys in cache.rates (USDC, EURT, NGN).
// Any asset id missing from the response is left at its previous value.

const RATE_FETCH_TIMEOUT_MS = 10_000;
const ASSET_ID_TO_KEY: Record<string, string> = {
  'usd-coin':  'USDC',
  'tether-eurt': 'EURT',
  // NGN is the base currency (rate === 1.0) and not fetched.
};

let refreshIntervalHandle: ReturnType<typeof setInterval> | null = null;
let lastRefresh: { at: number; ok: boolean; durationMs: number; error?: string } | null = null;
let lastSuccessfulFetch: number | null = null;
let fallbackStartTime: number | null = null;

// Log every 5 minutes when in fallback mode
const FALLBACK_WARNING_INTERVAL_MS = 5 * 60 * 1000;

async function fetchBaseRates(): Promise<Record<string, number> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RATE_FETCH_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(env.RATES_API_URL, { signal: controller.signal });
    if (!res.ok) {
      const msg = `RATES_API_URL responded ${res.status} ${res.statusText}`;
      fastify.log.warn({ status: res.status, url: env.RATES_API_URL }, msg);
      lastRefresh = { at: Date.now(), ok: false, durationMs: Date.now() - startedAt, error: msg };
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
      const msg = 'RATES_API_URL response had no recognised assets';
      fastify.log.warn({ body }, msg);
      lastRefresh = { at: Date.now(), ok: false, durationMs: Date.now() - startedAt, error: msg };
      return null;
    }
    lastRefresh = { at: Date.now(), ok: true, durationMs: Date.now() - startedAt };
    lastSuccessfulFetch = Date.now();
    fallbackStartTime = null;
    return fetched;
  } catch (err) {
    const e = err as Error;
    const msg = e.name === 'AbortError' ? 'RATES_API_URL fetch timed out' : `RATES_API_URL fetch failed: ${e.message}`;
    fastify.log.warn({ err: e.message }, msg);
    lastRefresh = { at: Date.now(), ok: false, durationMs: Date.now() - startedAt, error: msg };
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// #388 — cache stampede protection constants
const RATE_FETCH_LOCK_KEY    = 'rate_fetch_lock:global';
const RATE_FETCH_LOCK_TTL_MS = 5_000;
const STAMPEDE_POLL_INTERVAL = 50;   // ms between polls
const STAMPEDE_POLL_TIMEOUT  = 5_000; // ms before giving up and fetching directly

// Acquire a SET NX lock in Redis. Returns the lock token if acquired, null otherwise.
async function acquireRateFetchLock(): Promise<string | null> {
  const token = randomUUID();
  const result = await redis
    .set(RATE_FETCH_LOCK_KEY, token, 'PX', RATE_FETCH_LOCK_TTL_MS, 'NX')
    .catch(() => null);
  return result === 'OK' ? token : null;
}

async function releaseRateFetchLock(token: string): Promise<void> {
  // Only delete the key if we still own it (Lua for atomicity)
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(script, 1, RATE_FETCH_LOCK_KEY, token).catch(() => {});
}

async function refreshTick(): Promise<void> {
  try {
    // #388 — attempt to acquire the distributed fetch lock
    const lockToken = await acquireRateFetchLock().catch(() => null);

    if (lockToken !== null) {
      // We hold the lock — perform the fetch
      try {
        const fetched = await fetchBaseRates();
        if (fetched) {
          const merged: Record<string, number> = { ...cache.rates, ...fetched };
          updateBaseRates(merged);
          fastify.log.info(
            { durationMs: lastRefresh?.durationMs, assets: Object.keys(fetched) },
            'FX rates refreshed',
          );
        } else {
          if (fallbackStartTime === null) {
            fallbackStartTime = Date.now();
            fastify.log.warn('Entering fallback FX rate mode');
          }
        }
      } finally {
        await releaseRateFetchLock(lockToken);
      }
      return;
    }

    // Lock not acquired — another instance is fetching. Busy-poll the snapshot
    // store until the lock holder populates it or the timeout expires.
    const deadline = Date.now() + STAMPEDE_POLL_TIMEOUT;
    const snapshotBefore = cache.cachedAt;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, STAMPEDE_POLL_INTERVAL));
      if (cache.cachedAt > snapshotBefore) {
        fastify.log.info('Stampede protection: another instance refreshed the rate cache');
        return;
      }
    }

    // Lock holder may have failed — attempt fetch ourselves as fallback
    fastify.log.warn('Stampede poll timed out; falling back to direct fetch');
    const fetched = await fetchBaseRates();
    if (fetched) {
      updateBaseRates({ ...cache.rates, ...fetched });
    } else if (fallbackStartTime === null) {
      fallbackStartTime = Date.now();
      fastify.log.warn('Entering fallback FX rate mode');
    }
  } catch (err) {
    fastify.log.error({ err }, 'Unexpected error in refresh tick');
  }
}

async function warmupCacheFromRedis(): Promise<void> {
  try {
    const members = await redis.zrevrangebyscore(SNAPSHOT_KEY, '+inf', '-inf', 'LIMIT', 0, 1);
    if (!members.length) {
      fastify.log.info('No cached rate snapshot found in Redis; using fallback rates');
      return;
    }

    const snapshot = JSON.parse(members[0]) as { ts: number; rates: Record<string, number> };
    updateBaseRates(snapshot.rates);
    computedRateCache.clear();
    fastify.log.info(
      { timestamp: new Date(snapshot.ts).toISOString(), rates: snapshot.rates },
      'Rate cache warmed up from Redis snapshot',
    );
  } catch (err) {
    const e = err as Error;
    fastify.log.warn({ err: e.message }, 'Failed to warm up cache from Redis; using fallback rates');
  }
}

let fallbackWarningIntervalHandle: ReturnType<typeof setInterval> | null = null;

function startRefreshLoop(): void {
  if (refreshIntervalHandle !== null) return;
  refreshIntervalHandle = setInterval(refreshTick, env.RATES_REFRESH_INTERVAL_MS);
  // Don't keep the process alive solely for this interval.
  if (typeof refreshIntervalHandle.unref === 'function') {
    refreshIntervalHandle.unref();
  }
  fastify.log.info(
    { intervalMs: env.RATES_REFRESH_INTERVAL_MS, url: env.RATES_API_URL },
    'FX rate refresh loop started',
  );

  // Log warning every 5 minutes if in fallback mode (#236)
  if (fallbackWarningIntervalHandle === null) {
    fallbackWarningIntervalHandle = setInterval(() => {
      if (fallbackStartTime !== null) {
        const durationMs = Date.now() - fallbackStartTime;
        const durationMin = Math.round(durationMs / 60000);
        fastify.log.warn(
          { durationMs, durationMin },
          `Operating in fallback FX rate mode for ${durationMin} minute(s); rates API unavailable`,
        );
      }
    }, FALLBACK_WARNING_INTERVAL_MS);
    if (typeof fallbackWarningIntervalHandle.unref === 'function') {
      fallbackWarningIntervalHandle.unref();
    }
  }
}

// ── Quote storage (issue #57) ────────────────────────────────────────────
// Quotes are stored in Redis under fx:quote:<quoteId>.
//
// Two TTLs:
//   QUOTE_TTL_MS         — how long the rate is locked / valid (60 s, = RATE_TTL_MS)
//   QUOTE_CLEANUP_TTL_MS — how long the key lives in Redis    (10 min)
//
// The longer cleanup TTL lets POST /api/quote/verify return
// { valid: false, stale: true, currentRate } for expired-but-known quotes
// instead of a 404, so clients can see how much the rate has moved.

const QUOTE_TTL_MS         = RATE_TTL_MS;
const QUOTE_CLEANUP_TTL_MS = 10 * 60 * 1000;
const QUOTE_KEY_PREFIX     = 'fx:quote:';

interface StoredQuote {
  quoteId:     string;
  from:        string;
  to:          string;
  amount:      string;
  result:      string;
  rate:        string;
  slippageBps: number;
  expiresAt:   number; // Unix ms — quote validity cutoff
}

const fastify = Fastify({
  logger: createLoggerOptions({ level: env.LOG_LEVEL }),
});

registerRequestId(fastify);
// #386 — exponential backoff retry strategy
redis = createRedisClient(env.REDIS_URL, fastify.log);
redis.on('error', (err: any) => fastify.log.warn({ err: err.message }, 'Redis error in fx-engine'));
fastify.addHook('onClose', async () => { await redis.quit().catch(() => {}); });

// ── Rate history cleanup job ──────────────────────────────────────────────
// BullMQ repeatable job that runs daily to purge rate history snapshots
// older than RATE_HISTORY_RETENTION_DAYS.  Re-reads the env var each run
// so operators can tune retention without a restart.

const redisConn = new URL(env.REDIS_URL);
const bullMqConnection = {
  host: redisConn.hostname,
  port: parseInt(redisConn.port || '6379', 10),
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    const delay = Math.min(Math.pow(2, times) * 100, 5_000);
    fastify.log.warn({ attempt: times, delayMs: delay }, 'BullMQ Redis connection retry (cleanup)');
    return delay;
  },
};

/**
 * Reads RATE_HISTORY_RETENTION_DAYS from the environment each invocation
 * (no restart required when the value changes) and purges rate history
 * snapshots older than the retention window from the Redis sorted set.
 *
 * @returns Number of entries removed.
 */
async function runRateHistoryCleanup(): Promise<number> {
  const retentionDays = parseInt(
    process.env.RATE_HISTORY_RETENTION_DAYS ?? '7',
    10,
  );
  const effectiveDays = Number.isFinite(retentionDays) && retentionDays >= 1
    ? retentionDays
    : 7;
  const cutoff = Date.now() - effectiveDays * 24 * 60 * 60 * 1000;

  const purged = await redis.zremrangebyscore(SNAPSHOT_KEY, '-inf', cutoff);
  fastify.log.info(
    { purged, retentionDays: effectiveDays, cutoff: new Date(cutoff).toISOString() },
    'Rate history cleanup completed',
  );
  return purged;
}

const cleanupQueue = new Queue('rate-history-cleanup', {
  connection: bullMqConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

const cleanupWorker = new Worker(
  'rate-history-cleanup',
  async (_job) => {
    await runRateHistoryCleanup();
  },
  {
    connection: bullMqConnection,
    concurrency: 1,
    autorun: true,
  },
);

cleanupWorker.on('error', (err) => {
  fastify.log.error({ err: err.message }, 'Rate history cleanup worker error');
});

cleanupQueue.on('error', (err) => {
  fastify.log.error({ err: err.message }, 'Rate history cleanup queue error');
});

fastify.register(cors, {
  origin: env.ALLOWED_ORIGINS,
});
fastify.register(rateLimit, { max: 200, timeWindow: 60 * 1000 });
registerErrorHandler(fastify);
registerServiceAuth(fastify, env.INTER_SERVICE_SECRET);
// Distributed tracing: log + propagate x-request-id / x-trace-id (#118).
registerTracing(fastify);

fastify.get('/api/health', async (_request, reply) => {
  const health = await buildFxEngineHealthResponse({
    pingRedis: () => redis.ping(),
    ratesApiUrl: env.RATES_API_URL,
    startTime,
    service: 'fx-engine',
    version: SERVICE_VERSION,
  });

  // Degrade to degraded if fallback mode has been active for >1 hour (#236)
  const ONE_HOUR_MS = 60 * 60 * 1000;
  if (fallbackStartTime !== null && Date.now() - fallbackStartTime > ONE_HOUR_MS) {
    if (health.status !== 'unhealthy') {
      health.status = 'degraded';
      const ratesApi = health.upstream?.find((d) => d.name === 'rates-api');
      if (ratesApi) {
        ratesApi.details = {
          ...(ratesApi.details ?? {}),
          fallbackModeDuration: 'exceeded 1 hour',
        };
      }
    }
  }

  const statusCode = health.status === 'unhealthy' ? 503 : 200;
  return reply.code(statusCode).send(health);
});

fastify.get('/api/rates', async (_request, _reply) => {
  return { rates: cache.rates, updatedAt: new Date(cache.cachedAt).toISOString() };
});

fastify.get('/api/currencies', async (_request, _reply) => {
  return {
    currencies: SUPPORTED_CURRENCIES.map((code) => ({
      code,
      name: CURRENCY_DISPLAY_NAMES[code],
    })),
  };
});

// ── GET /api/admin/rates/status (#236) ─────────────────────────────────
// Admin endpoint showing rate fetch mode (live vs fallback), staleness, and duration.

fastify.get('/api/admin/rates/status', {
  preValidation: [fastify.serviceAuth],
}, async (_request, _reply) => {
  const inFallback = fallbackStartTime !== null;
  const fallbackDurationMs = fallbackStartTime !== null ? Date.now() - fallbackStartTime : 0;
  const fallbackDurationMin = Math.round(fallbackDurationMs / 60000);

  return {
    mode: inFallback ? 'fallback' : 'live',
    lastSuccessfulFetch: lastSuccessfulFetch ? new Date(lastSuccessfulFetch).toISOString() : null,
    fallbackActiveDuration: inFallback ? `${fallbackDurationMin} minutes` : null,
    fallbackActiveDurationMs: fallbackDurationMs,
    currentRates: cache.rates,
    updatedAt: new Date(cache.cachedAt).toISOString(),
  };
});

// ── GET /api/quote (issues #48 & #49) ────────────────────────────────────

const QuoteQuerySchema = z.object({
  from:        CurrencyCode.default('USDC'),
  to:          CurrencyCode.default('NGN'),
  amount:      z.string().regex(/^\d+(\.\d+)?$/, 'amount must be a numeric string').default('1'),
  slippageBps: z.string().regex(/^\d+$/, 'slippageBps must be a non-negative integer').optional(),
});

fastify.get(
  '/api/quote',
  {
    config: {
      rateLimit: {
        max:        100,
        timeWindow: 60 * 1000,
      },
    },
  },
  async (request, reply) => {
    let query: z.infer<typeof QuoteQuerySchema>;
    try {
      query = QuoteQuerySchema.parse(request.query);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.code(400).send(
          createErrorResponse(ErrorCodes.INVALID_QUERY, 'Invalid query parameters', err.errors),
        );
      }
      throw err;
    }

    const from   = query.from.toUpperCase();
    const to     = query.to.toUpperCase();
    const amount = parseFloat(query.amount);

    if (amount <= 0) {
      return reply.code(400).send(
        createErrorResponse(ErrorCodes.INVALID_AMOUNT, 'Amount must be greater than zero'),
      );
    }

    // Validate that both currencies are supported (issue #49)
    const unsupported: string[] = [];
    if (!SUPPORTED_CURRENCIES.includes(from)) unsupported.push(from);
    if (!SUPPORTED_CURRENCIES.includes(to))   unsupported.push(to);

    if (unsupported.length > 0) {
      return reply.code(400).send(
        createErrorResponse(
          ErrorCodes.UNSUPPORTED_CURRENCY_PAIR,
          `Unsupported currency: ${unsupported.join(', ')}`,
          { unsupportedCurrencies: unsupported, supportedCurrencies: SUPPORTED_CURRENCIES },
        ),
      );
    }

    if (from === to) {
      return reply.code(400).send(
        createErrorResponse(ErrorCodes.INVALID_QUERY, 'from and to must be different currencies'),
      );
    }

    const requestedBps  = query.slippageBps !== undefined
      ? parseInt(query.slippageBps, 10)
      : env.DEFAULT_SLIPPAGE_BPS;
    const effectiveBps  = Math.min(requestedBps, env.MAX_SLIPPAGE_BPS);
    const slippageLimit = (effectiveBps / 10_000).toFixed(4);

    const exchangeRate = getOrComputeRate(from, to);
    const targetAmount = amount * exchangeRate;
    const expiresAt    = Date.now() + QUOTE_TTL_MS;

    // Store quote so it can be verified later. If Redis is unavailable the
    // quote is still returned — clients just won't be able to call /verify.
    let quoteId: string | null = null;
    try {
      quoteId = randomUUID();
      const stored: StoredQuote = {
        quoteId,
        from,
        to,
        amount:      query.amount,
        result:      targetAmount.toFixed(4),
        rate:        exchangeRate.toFixed(8),
        slippageBps: effectiveBps,
        expiresAt,
      };
      await redis.set(
        `${QUOTE_KEY_PREFIX}${quoteId}`,
        JSON.stringify(stored),
        'PX',
        QUOTE_CLEANUP_TTL_MS,
      );
    } catch (err) {
      fastify.log.warn({ err }, 'Failed to store quote; quote will not be verifiable');
      quoteId = null;
    }

    return {
      quoteId,
      from,
      to,
      amount:        query.amount,
      result:        targetAmount.toFixed(4),
      rate:          exchangeRate.toFixed(8),
      slippageBps:   effectiveBps,
      slippageLimit,
      cachedAt:      new Date(cache.cachedAt).toISOString(),
      expiresAt:     new Date(expiresAt).toISOString(),
    };
  },
);

// ── GET /api/rates/history (issue #56) ───────────────────────────────────

const HistoryQuerySchema = z.object({
  from: CurrencyCode,
  to:   CurrencyCode,
  at:   z.string().optional(), // ISO 8601; defaults to now
});

fastify.get(
  '/api/rates/history',
  {
    config: {
      rateLimit: {
        max:        100,
        timeWindow: 60 * 1000,
      },
    },
  },
  async (request, reply) => {
    let query: z.infer<typeof HistoryQuerySchema>;
    try {
      query = HistoryQuerySchema.parse(request.query);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.code(400).send(
          createErrorResponse(ErrorCodes.INVALID_QUERY, 'Invalid query parameters', err.errors),
        );
      }
      throw err;
    }

    const from = query.from.toUpperCase();
    const to   = query.to.toUpperCase();

    const unsupported: string[] = [];
    if (!SUPPORTED_CURRENCIES.includes(from)) unsupported.push(from);
    if (!SUPPORTED_CURRENCIES.includes(to))   unsupported.push(to);

    if (unsupported.length > 0) {
      return reply.code(400).send(
        createErrorResponse(
          ErrorCodes.UNSUPPORTED_CURRENCY_PAIR,
          `Unsupported currency: ${unsupported.join(', ')}`,
          { unsupportedCurrencies: unsupported, supportedCurrencies: SUPPORTED_CURRENCIES },
        ),
      );
    }

    if (from === to) {
      return reply.code(400).send(
        createErrorResponse(ErrorCodes.INVALID_QUERY, 'from and to must be different currencies'),
      );
    }

    const atMs = query.at ? new Date(query.at).getTime() : Date.now();
    if (isNaN(atMs)) {
      return reply.code(400).send(
        createErrorResponse(ErrorCodes.INVALID_QUERY, 'at must be a valid ISO 8601 timestamp'),
      );
    }

    const members = await redis.zrevrangebyscore(SNAPSHOT_KEY, atMs, '-inf', 'LIMIT', 0, 1);
    if (!members.length) {
      return reply.code(404).send(
        createErrorResponse(
          ErrorCodes.NOT_FOUND,
          'No rate snapshot found at or before the requested time',
        ),
      );
    }

    const snapshot = JSON.parse(members[0]) as { ts: number; rates: Record<string, number> };

    if (!(from in snapshot.rates) || !(to in snapshot.rates)) {
      return reply.code(404).send(
        createErrorResponse(
          ErrorCodes.NOT_FOUND,
          'No rate data for the requested pair at the given time',
        ),
      );
    }

    const rate = computeRate(from, to, snapshot.rates);

    return {
      from,
      to,
      rate: rate.toFixed(8),
      at:   new Date(snapshot.ts).toISOString(),
    };
  },
);

// ── POST /api/quote/verify (issue #57) ───────────────────────────────────

const VerifyQuoteBody = z.object({
  quoteId: z.string().min(1),
});

interface VerifyQuoteRouteBody {
  quoteId?: unknown;
}

fastify.post<{ Body: VerifyQuoteRouteBody }>(
  '/api/quote/verify',
  {
    config: {
      rateLimit: {
        max:        100,
        timeWindow: 60 * 1000,
      },
    },
  },
  async (request, reply) => {
    let body: z.infer<typeof VerifyQuoteBody>;
    try {
      body = VerifyQuoteBody.parse(request.body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.code(400).send(
          createErrorResponse(ErrorCodes.INVALID_QUERY, 'Invalid request body', err.errors),
        );
      }
      throw err;
    }

    const raw = await redis.get(`${QUOTE_KEY_PREFIX}${body.quoteId}`);
    if (!raw) {
      return reply.code(404).send(
        createErrorResponse(ErrorCodes.NOT_FOUND, 'Quote not found'),
      );
    }

    const stored      = JSON.parse(raw) as StoredQuote;
    const now         = Date.now();
    const valid       = now <= stored.expiresAt;
    const currentRate = getOrComputeRate(stored.from, stored.to);
    const slippageBps = stored.slippageBps ?? env.DEFAULT_SLIPPAGE_BPS;

    return {
      valid,
      stale:         !valid,
      quoteId:       stored.quoteId,
      from:          stored.from,
      to:            stored.to,
      rate:          stored.rate,
      currentRate:   currentRate.toFixed(8),
      slippageBps,
      slippageLimit: (slippageBps / 10_000).toFixed(4),
      expiresAt:     new Date(stored.expiresAt).toISOString(),
    };
  },
);

// ── Start ──────────────────────────────────────────────────────────────────

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  fastify.log.info(`Received ${signal}, shutting down gracefully...`);

  try {
    if (refreshIntervalHandle !== null) {
      clearInterval(refreshIntervalHandle);
      refreshIntervalHandle = null;
    }
    await cleanupWorker.close();
    await cleanupQueue.close();
    await fastify.close();
    await new Promise<void>((resolve) => metricsServer.close(() => resolve()));
    process.exit(0);
  } catch (err) {
    fastify.log.error(err, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Prometheus metrics endpoint (#387) ────────────────────────────────────
promClient.collectDefaultMetrics();

const redisMemoryGauge = new promClient.Gauge({
  name: 'redis_memory_usage_bytes',
  help: 'Current Redis memory usage in bytes (used_memory from INFO memory)',
});
const redisEvictedCounter = new promClient.Counter({
  name: 'redis_evicted_keys_total',
  help: 'Total number of keys evicted from Redis (evicted_keys from INFO stats)',
});

// Served on its own port (see startMetricsServer below), not on the
// application port — keeps the scrape endpoint unauthenticated without
// exposing it alongside application traffic.
const metricsServer = startMetricsServer({
  appPort: PORT,
  contentType: promClient.register.contentType,
  getMetrics: () => promClient.register.metrics(),
  log: fastify.log,
});

const start = async () => {
  try {
    // #391 — wait for Redis before doing anything else
    await waitForRedis(redis, fastify.log);

    // Warm up cache from latest Redis snapshot (#232)
    await warmupCacheFromRedis();
    // Seed the snapshot store so history is queryable from the very first request
    await storeRateSnapshot(cache.rates).catch((err) => {
      fastify.log.warn({ err }, 'Failed to store initial rate snapshot');
    });
    // First refresh before we start serving: if it succeeds, cache is
    // updated; if it fails, we keep the FALLBACK_RATES seed.
    await refreshTick();
    startRefreshLoop();

    // #387 — Redis memory monitoring: update prom gauges every 30 s
    startRedisMemoryMonitor(redis, fastify.log, {
      intervalMs: 30_000,
      warnThresholdRatio: 0.8,
    });

    // Schedule the daily rate history cleanup repeatable job.
    // The job key is static so re-deployments don't duplicate the schedule.
    await cleanupQueue.add(
      'daily-cleanup',
      {},
      {
        repeat: { pattern: '0 0 * * *' },
        jobId: 'rate-history-cleanup-daily',
      },
    );
    fastify.log.info('Rate history cleanup repeatable job scheduled (daily at midnight)');

    // Wire up gauge updates alongside the shared logger-based monitor
    setInterval(async () => {
      try {
        const [memInfo, statsInfo] = await Promise.all([
          redis.info('memory'),
          redis.info('stats'),
        ]);
        const usedMemMatch = memInfo.match(/^used_memory:(\d+)/m);
        const evictedMatch = statsInfo.match(/^evicted_keys:(\d+)/m);
        if (usedMemMatch) redisMemoryGauge.set(parseInt(usedMemMatch[1], 10));
        if (evictedMatch) redisEvictedCounter.reset(); // counter only grows; set abs value via inc
      } catch {
        // non-fatal
      }
    }, 30_000);

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();
