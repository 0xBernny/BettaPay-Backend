import { Redis, type RedisOptions } from 'ioredis';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface MinimalLogger {
  warn: (obj: object, msg?: string) => void;
  info: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

export interface CreateRedisClientOptions extends Omit<RedisOptions, 'retryStrategy'> {
  maxDelayMs?: number;
}

// #386 — exponential backoff: 2^attempt × 100 ms, capped at maxDelayMs (default 5 s).
// Retries indefinitely so transient restarts do not permanently break the connection.
export function createRedisClient(
  url: string,
  logger: MinimalLogger,
  options: CreateRedisClientOptions = {},
): Redis {
  const { maxDelayMs = 5_000, ...rest } = options;

  return new Redis(url, {
    enableOfflineQueue: false,
    ...rest,
    retryStrategy: (attempt: number) => {
      const delay = Math.min(Math.pow(2, attempt) * 100, maxDelayMs);
      logger.warn({ attempt, delayMs: delay }, 'Redis connection retry');
      return delay;
    },
  });
}

export interface WaitForRedisOptions {
  maxRetries?: number;
  intervalMs?: number;
}

// #391 — block startup until Redis responds to PING or exhaust retries and throw.
export async function waitForRedis(
  redis: Redis,
  logger: MinimalLogger,
  options: WaitForRedisOptions = {},
): Promise<void> {
  const maxRetries = options.maxRetries ?? 10;
  const intervalMs = options.intervalMs ?? 1_000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await redis.ping();
      logger.info({ attempt: attempt + 1 }, 'Redis ready');
      return;
    } catch (err) {
      const remaining = maxRetries - attempt - 1;
      if (remaining > 0) {
        logger.warn(
          { attempt: attempt + 1, maxRetries, nextRetryMs: intervalMs, err: (err as Error).message },
          'Redis not ready, retrying',
        );
        await sleep(intervalMs);
      }
    }
  }

  throw new Error(`Redis not ready after ${maxRetries} attempts — aborting startup`);
}

export interface RedisMemoryMonitorOptions {
  intervalMs?: number;
  warnThresholdRatio?: number;
}

interface MemoryMonitorResult {
  stop: () => void;
}

// #387 — poll Redis INFO every intervalMs; log warn when usage exceeds threshold.
// Returns a handle with a stop() method to cancel the interval on shutdown.
export function startRedisMemoryMonitor(
  redis: Redis,
  logger: MinimalLogger,
  options: RedisMemoryMonitorOptions = {},
): MemoryMonitorResult {
  const intervalMs = options.intervalMs ?? 30_000;
  const warnThresholdRatio = options.warnThresholdRatio ?? 0.8;

  let lastEvictedKeys = 0;

  async function collect(): Promise<void> {
    try {
      const [memInfo, statsInfo] = await Promise.all([
        redis.info('memory'),
        redis.info('stats'),
      ]);

      const usedMemory = parseRedisInfoInt(memInfo, 'used_memory');
      const maxMemory = parseRedisInfoInt(memInfo, 'maxmemory');
      const evictedKeys = parseRedisInfoInt(statsInfo, 'evicted_keys');

      const evictedDelta = evictedKeys - lastEvictedKeys;
      lastEvictedKeys = evictedKeys;

      logger.info(
        {
          redis_memory_usage_bytes: usedMemory,
          redis_evicted_keys_total: evictedKeys,
          redis_evicted_keys_delta: evictedDelta,
          maxmemory: maxMemory,
        },
        'Redis memory stats',
      );

      if (maxMemory > 0 && usedMemory / maxMemory > warnThresholdRatio) {
        logger.warn(
          {
            redis_memory_usage_bytes: usedMemory,
            maxmemory: maxMemory,
            utilizationPct: ((usedMemory / maxMemory) * 100).toFixed(1),
            threshold: `${warnThresholdRatio * 100}%`,
          },
          'Redis memory usage above warning threshold',
        );
      }
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Failed to collect Redis memory stats');
    }
  }

  const handle = setInterval(collect, intervalMs);
  if (typeof (handle as any).unref === 'function') (handle as any).unref();

  return {
    stop: () => clearInterval(handle),
  };
}

function parseRedisInfoInt(info: string, key: string): number {
  const match = info.match(new RegExp(`^${key}:(\\d+)`, 'm'));
  return match ? parseInt(match[1], 10) : 0;
}
