/**
 * Server-side wallet auth challenge store (#469).
 *
 * The `/api/auth/wallet/challenge` endpoint issues a random nonce; the wallet
 * signs it and posts it back to `/api/auth/wallet/verify`. Without a server
 * record binding that nonce to the address, with an expiry, and consumed
 * atomically on use, a captured signed message can be replayed.
 *
 * This module keeps the challenge in Redis, keyed by address, with a TTL, and
 * consumes it with a single atomic GET+DEL so a replay of the same signed
 * challenge finds nothing and is rejected. The verify handler must check the
 * *stored* challenge string (not the client-supplied one) against the
 * signature.
 */

import type { Redis } from 'ioredis';

export const WALLET_CHALLENGE_TTL_MS = 2 * 60 * 1000;

export interface StoredWalletChallenge {
  /** The exact string the wallet is expected to sign. */
  challenge: string;
  /** Raw nonce embedded in `challenge`. */
  nonce: string;
  /** Address the challenge was issued to — the binding. */
  address: string;
  /** Epoch ms when the challenge stops being valid. */
  expiresAt: number;
}

export function walletChallengeKey(address: string): string {
  return `wallet_challenge:${address}`;
}

/**
 * Store (or replace) the pending challenge for an address. A fresh challenge
 * request always supersedes any earlier unconsumed one.
 */
export async function storeWalletChallenge(
  redis: Redis,
  record: StoredWalletChallenge,
  ttlMs: number = WALLET_CHALLENGE_TTL_MS,
): Promise<void> {
  await redis.set(
    walletChallengeKey(record.address),
    JSON.stringify(record),
    'PX',
    ttlMs,
  );
}

// GET the challenge and DEL it in one round trip so it can be used at most
// once, even under concurrent verify requests.
const consumeScript = `
  local v = redis.call('GET', KEYS[1])
  if v then
    redis.call('DEL', KEYS[1])
  end
  return v
`;

/**
 * Atomically read and delete the pending challenge for an address. Returns
 * `null` when there is nothing pending (never issued, already consumed, or
 * expired by TTL) — the caller must treat that as a 409.
 */
export async function consumeWalletChallenge(
  redis: Redis,
  address: string,
): Promise<StoredWalletChallenge | null> {
  const raw = (await redis.eval(consumeScript, 1, walletChallengeKey(address))) as
    | string
    | null;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredWalletChallenge;
    if (
      !parsed ||
      typeof parsed.challenge !== 'string' ||
      typeof parsed.address !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
