/**
 * Redis-based per-merchant semaphore for settlement processing.
 *
 * Limits the number of concurrent settlements a single merchant can occupy
 * across all worker instances. Uses Redis SET with sorted-set-like counting
 * via INCR + TTL for lock safety (auto-releases on crash).
 */

import type { Redis } from 'ioredis';

const DEFAULT_MAX_CONCURRENT = 3;
const DEFAULT_TTL_SECONDS = 60;

export interface SemaphoreOptions {
  /** Max concurrent jobs per merchant (default: 3) */
  maxConcurrent?: number;
  /** TTL in seconds for auto-release on crash (default: 60) */
  ttlSeconds?: number;
  /** Key prefix (default: 'semaphore:settlement') */
  prefix?: string;
}

const acquireScript = `
  local key = KEYS[1]
  local now = tonumber(ARGV[1])
  local windowMs = tonumber(ARGV[2])
  local maxConcurrent = tonumber(ARGV[3])
  local member = ARGV[4]
  local ttlSeconds = tonumber(ARGV[5])

  redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)

  local count = redis.call('ZCARD', key)
  if count >= maxConcurrent then
    return 0
  end

  redis.call('ZADD', key, now, member)
  redis.call('EXPIRE', key, ttlSeconds)
  return 1
`;

/**
 * Try to acquire a semaphore slot for the given merchant.
 * Returns `true` if acquired, `false` if at capacity.
 */
export async function acquireSemaphore(
  redis: Redis,
  merchantId: string,
  opts: SemaphoreOptions = {},
): Promise<boolean> {
  const { maxConcurrent = DEFAULT_MAX_CONCURRENT, ttlSeconds = DEFAULT_TTL_SECONDS, prefix = 'semaphore:settlement' } = opts;
  const key = `${prefix}:${merchantId}`;
  const now = Date.now();
  const windowMs = ttlSeconds * 1000;
  const member = `${now}:${Math.random().toString(36).slice(2)}`;

  const acquired = await redis.eval(
    acquireScript,
    1,
    key,
    now.toString(),
    windowMs.toString(),
    maxConcurrent.toString(),
    member,
    ttlSeconds.toString()
  );

  return acquired === 1;
}

/**
 * Release one semaphore slot for the given merchant.
 * Removes the oldest entry from the sorted set.
 */
export async function releaseSemaphore(
  redis: Redis,
  merchantId: string,
  opts: SemaphoreOptions = {},
): Promise<void> {
  const { prefix = 'semaphore:settlement' } = opts;
  const key = `${prefix}:${merchantId}`;

  // Remove the oldest entry (lowest score)
  const removed = await redis.zpopmin(key, 1);
  if (removed.length === 0) return;

  // Clean up key if empty
  const remaining = await redis.zcard(key);
  if (remaining === 0) {
    await redis.del(key);
  }
}

/**
 * Get the current count of active jobs for a merchant.
 */
export async function getActiveCount(
  redis: Redis,
  merchantId: string,
  opts: SemaphoreOptions = {},
): Promise<number> {
  const { ttlSeconds = DEFAULT_TTL_SECONDS, prefix = 'semaphore:settlement' } = opts;
  const key = `${prefix}:${merchantId}`;
  const now = Date.now();
  const windowMs = ttlSeconds * 1000;

  await redis.zremrangebyscore(key, 0, now - windowMs);
  return redis.zcard(key);
}
