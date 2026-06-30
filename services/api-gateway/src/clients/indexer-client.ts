/**
 * Indexer HTTP client (Issue #116)
 *
 * The api-gateway has `INDEXER_URL` configured but historically never queried the
 * indexer. This client lets payment-status lookups cross-reference on-chain
 * events indexed from the settlement contract, giving end-to-end visibility of a
 * payment's lifecycle.
 *
 * Design goals:
 *  - **Graceful degradation:** the indexer is an *enrichment* source, never a
 *    dependency for serving payment data. Any failure (timeout, network error,
 *    non-2xx, malformed body) resolves to `null` so callers can return the
 *    payment without events instead of failing the request.
 *  - **Bounded latency:** every request is capped by a 5s timeout via
 *    `AbortController`, so a slow/hung indexer cannot stall the gateway.
 *  - **Testable:** `fetchImpl` is injectable for unit tests.
 */

import type { IndexedEvent, EventType } from '@bettapay/validation';
import { propagateTracingHeaders } from '@bettapay/validation';

type IncomingHeaders = Record<string, string | string[] | undefined>;

/**
 * A single indexed on-chain event as returned by the indexer's `/api/events`.
 * Aliased to the shared `IndexedEvent` type so the gateway and indexer stay in
 * lock-step on the event shape (`{ topics, type, rawValue, … }`).
 */
export type IndexerEvent = IndexedEvent;

interface MinimalLogger {
  warn: (obj: unknown, msg?: string) => void;
}

export interface IndexerClientOptions {
  /** Base URL of the indexer service, e.g. `http://localhost:3003`. */
  baseUrl: string;
  /**
   * Shared INTER_SERVICE_SECRET sent as the `x-service-token` header so the
   * indexer's serviceAuth accepts the request (#117). Optional for backwards
   * compatibility / local setups without inter-service auth.
   */
  serviceToken?: string;
  /** Per-request timeout in milliseconds (default 5000). */
  timeoutMs?: number;
  /** Injectable fetch implementation (defaults to global `fetch`). */
  fetchImpl?: typeof fetch;
  /** Optional logger for degradation diagnostics. */
  logger?: MinimalLogger;
}

export const DEFAULT_INDEXER_TIMEOUT_MS = 5_000;

/** Event type identifying a completed payment on-chain. */
export const PAYMENT_COMPLETED_TYPE: EventType = 'PaymentCompleted';

export interface IndexerClient {
  /**
   * Fetch on-chain `PaymentCompleted` events related to a merchant.
   *
   * @param merchantId      merchant whose events to fetch
   * @param incomingHeaders inbound request headers; tracing headers
   *                        (x-request-id / x-trace-id) are propagated downstream (#118)
   * @returns the matching events on success (possibly empty), or `null` when the
   *          indexer is unavailable so the caller can degrade gracefully.
   */
  getPaymentEvents(merchantId: string, incomingHeaders?: IncomingHeaders): Promise<IndexerEvent[] | null>;
}

export function createIndexerClient(options: IndexerClientOptions): IndexerClient {
  const {
    baseUrl,
    serviceToken,
    timeoutMs = DEFAULT_INDEXER_TIMEOUT_MS,
    fetchImpl = fetch,
    logger,
  } = options;

  const root = baseUrl.replace(/\/+$/, '');
  // Service token authenticates this gateway to the indexer (#117).
  const authHeaders: Record<string, string> = serviceToken
    ? { 'x-service-token': serviceToken }
    : {};

  async function getPaymentEvents(
    merchantId: string,
    incomingHeaders: IncomingHeaders = {},
  ): Promise<IndexerEvent[] | null> {
    // Auth (#117) + tracing (#118) headers for this inter-service call.
    const headers = propagateTracingHeaders(incomingHeaders, { ...authHeaders });
    // The indexer filters by `?type=` server-side; `merchantId` is forwarded for
    // forward-compatibility (ignored until the indexer decodes it). We still
    // filter by the typed `event.type` client-side as a defensive backstop.
    const url =
      `${root}/api/events` +
      `?type=${encodeURIComponent(PAYMENT_COMPLETED_TYPE)}` +
      `&merchantId=${encodeURIComponent(merchantId)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchImpl(url, { signal: controller.signal, headers });

      if (!res.ok) {
        logger?.warn(
          { status: res.status, merchantId },
          'indexer-client: non-OK response — returning no events',
        );
        return null;
      }

      const body = (await res.json()) as { events?: unknown };
      const events = Array.isArray(body?.events) ? (body.events as IndexerEvent[]) : [];

      return events.filter((e) => e?.type === PAYMENT_COMPLETED_TYPE);
    } catch (err) {
      // Timeout (AbortError), network failure, or malformed JSON all degrade to
      // "no events available" rather than failing the payment lookup.
      logger?.warn(
        { err, merchantId },
        'indexer-client: request failed — degrading without events',
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return { getPaymentEvents };
}
