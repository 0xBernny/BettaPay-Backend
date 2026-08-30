/**
 * Server-side wallet auth challenge store (Issue #554).
 *
 * Challenges used to live in a per-process `Map`. Nothing ever evicted an
 * entry that was never verified, the store was invisible to every other
 * gateway instance, and a challenge survived every failed verification
 * attempt — so a signature could be guessed at indefinitely against a single
 * outstanding challenge.
 *
 * Challenges now live in Redis under a TTL, and verification *consumes* them:
 *
 *   - Redis expires the key on its own, so a stale challenge disappears even
 *     if nobody ever comes back for it.
 *   - `consume()` reads and deletes in one atomic operation, so a challenge
 *     is usable exactly once — whether the signature turns out to be valid or
 *     not.
 *   - The recorded `expiresAt` is re-checked against the server clock, so a
 *     key that outlives its deadline (clock skew, a TTL that has not been
 *     reaped yet, a restored snapshot) is still rejected rather than
 *     accepted.
 */

import crypto from "crypto";

/** How long an issued challenge stays valid. */
export const WALLET_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export const WALLET_CHALLENGE_KEY_PREFIX = "wallet_challenge:";

export interface StoredWalletChallenge {
  challenge: string;
  issuedAt: number;
  expiresAt: number;
}

export type ConsumeChallengeResult =
  | { status: "valid"; challenge: StoredWalletChallenge }
  /** No challenge outstanding: never issued, already used, or reaped by Redis. */
  | { status: "not_found" }
  /** Still stored, but past its deadline according to the server clock. */
  | { status: "expired" };

/** The Redis surface this store needs. */
export interface WalletChallengeRedis {
  set(
    key: string,
    value: string,
    mode: "PX",
    ttlMs: number,
  ): Promise<unknown>;
  getdel(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
}

export interface WalletChallengeStoreOptions {
  ttlMs?: number;
  /** Injectable clock, so expiry is testable without waiting. */
  now?: () => number;
}

export function walletChallengeKey(address: string): string {
  return `${WALLET_CHALLENGE_KEY_PREFIX}${address}`;
}

export class WalletChallengeStore {
  private readonly redis: WalletChallengeRedis;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(
    redis: WalletChallengeRedis,
    options: WalletChallengeStoreOptions = {},
  ) {
    this.redis = redis;
    this.ttlMs = options.ttlMs ?? WALLET_CHALLENGE_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  /**
   * Issue a fresh challenge for an address, replacing any outstanding one.
   *
   * The key carries a Redis TTL matching the recorded deadline, so an
   * unclaimed challenge is reaped rather than accumulating forever.
   */
  async issue(address: string): Promise<StoredWalletChallenge> {
    const issuedAt = this.now();
    const record: StoredWalletChallenge = {
      challenge: crypto.randomBytes(32).toString("hex"),
      issuedAt,
      expiresAt: issuedAt + this.ttlMs,
    };

    await this.redis.set(
      walletChallengeKey(address),
      JSON.stringify(record),
      "PX",
      this.ttlMs,
    );

    return record;
  }

  /**
   * Atomically take an address's outstanding challenge.
   *
   * The read and the delete are one operation, so two concurrent
   * verifications cannot both claim the same challenge, and a caller that
   * fails verification does not get to retry against it.
   */
  async consume(address: string): Promise<ConsumeChallengeResult> {
    const key = walletChallengeKey(address);
    const raw = await this.redis.getdel(key);
    if (!raw) return { status: "not_found" };

    let record: StoredWalletChallenge;
    try {
      record = JSON.parse(raw) as StoredWalletChallenge;
    } catch {
      // A corrupt record is no better than none; it is already deleted.
      return { status: "not_found" };
    }

    if (
      typeof record?.challenge !== "string" ||
      typeof record?.expiresAt !== "number"
    ) {
      return { status: "not_found" };
    }

    if (this.now() > record.expiresAt) {
      return { status: "expired" };
    }

    return { status: "valid", challenge: record };
  }

  /** Drop an address's outstanding challenge without consuming it. */
  async discard(address: string): Promise<void> {
    await this.redis.del(walletChallengeKey(address));
  }
}
