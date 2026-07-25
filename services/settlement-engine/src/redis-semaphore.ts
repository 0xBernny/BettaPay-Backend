/**
 * Redis-based per-merchant semaphore for settlement processing.
 *
 * Limits the number of concurrent settlements a single merchant can occupy
 * across all worker instances. Uses Redis SET with sorted-set-like counting
 * via INCR + TTL for lock safety (auto-releases on crash).
 */

import type Redis from 'ioredis';

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

  // Clean up expired entries (entries older than TTL window)
  await redis.zremrangebyscore(key, 0, now - windowMs);

  const count = await redis.zcard(key);
  if (count >= maxConcurrent) {
    return false;
  }

  // Add current timestamp as score and member (unique per acquisition)
  await redis.zadd(key, now, `${now}:${Math.random().toString(36).slice(2)}`);
  await redis.expire(key, ttlSeconds);

  return true;
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
