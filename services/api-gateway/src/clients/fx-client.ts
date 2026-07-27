import { propagateTracingHeaders } from '@bettapay/validation';
import { defaultInterServiceMetrics, type InterServiceMetrics } from './inter-service-metrics.js';
import { UpstreamReadTimeoutError } from '../upstream-fetch.js';

type IncomingHeaders = Record<string, string | string[] | undefined>;

interface MinimalLogger {
  info?: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
}

export interface FxQuoteRequest {
  from: string;
  to: string;
  amount: string;
}

export interface FxQuoteResponse {
  quoteId: string | null;
  from: string;
  to: string;
  amount: string;
  result: string;
  rate: string;
  slippageBps: number;
  slippageLimit: string;
  cachedAt: string;
  expiresAt: string;
}

export interface FxClientOptions {
  baseUrl: string;
  serviceToken?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  logger?: MinimalLogger;
  metrics?: InterServiceMetrics;
}

export interface FxClient {
  getQuote(request: FxQuoteRequest, incomingHeaders?: IncomingHeaders): Promise<FxQuoteResponse | null>;
}

export const DEFAULT_FX_TIMEOUT_MS = 2_000;

export function createFxClient(options: FxClientOptions): FxClient {
  const {
    baseUrl,
    serviceToken,
    timeoutMs = DEFAULT_FX_TIMEOUT_MS,
    fetchImpl = fetch,
    logger,
    metrics = defaultInterServiceMetrics,
  } = options;

  const root = baseUrl.replace(/\/+$/, '');
  const TARGET = 'fx-service';
  const ENDPOINT = '/api/quote';

  // Last-good response cache: keyed by "from:to" (amount-independent so any
  // recent quote for a pair can be served as a stale fallback). The cache entry
  // is replaced on every successful response and read on timeout with no live
  // result available.
  const lastGoodCache = new Map<string, FxQuoteResponse>();

  async function getQuote(
    quoteRequest: FxQuoteRequest,
    incomingHeaders: IncomingHeaders = {},
  ): Promise<FxQuoteResponse | null> {
    const query = new URLSearchParams({
      from: quoteRequest.from,
      to: quoteRequest.to,
      amount: quoteRequest.amount,
    });
    const url = `${root}/api/quote?${query.toString()}`;
    const cacheKey = `${quoteRequest.from}:${quoteRequest.to}`;

    const baseHeaders: Record<string, string> = {};
    if (serviceToken) {
      baseHeaders['x-service-token'] = serviceToken;
    } else {
      const authorization = incomingHeaders.authorization ?? incomingHeaders.Authorization;
      const token = Array.isArray(authorization) ? authorization[0] : authorization;
      if (token) baseHeaders.authorization = token;
    }

    const headers = propagateTracingHeaders(incomingHeaders, baseHeaders);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      const res = await fetchImpl(url, { signal: controller.signal, headers });
      const durationSeconds = (Date.now() - startedAt) / 1000;
      const statusCode = String(res.status);

      metrics.duration.observe({ target_service: TARGET, endpoint: ENDPOINT, status_code: statusCode }, durationSeconds);

      if (!res.ok) {
        metrics.failures.inc({ target_service: TARGET, endpoint: ENDPOINT, status_code: statusCode });
        logger?.warn(
          { status: res.status, durationMs: durationSeconds * 1000, from: quoteRequest.from, to: quoteRequest.to },
          'fx-client: non-OK quote response - continuing without quote',
        );
        return null;
      }

      const body = (await res.json()) as FxQuoteResponse;

      // Populate / refresh the last-good cache on every successful response.
      lastGoodCache.set(cacheKey, body);

      logger?.info?.(
        { durationMs: durationSeconds * 1000, from: quoteRequest.from, to: quoteRequest.to },
        'fx-client: quote fetched',
      );
      return body;
    } catch (err) {
      const durationSeconds = (Date.now() - startedAt) / 1000;
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      const statusCode = isTimeout ? 'timeout' : 'network_error';

      metrics.failures.inc({ target_service: TARGET, endpoint: ENDPOINT, status_code: statusCode });
      metrics.duration.observe({ target_service: TARGET, endpoint: ENDPOINT, status_code: statusCode }, durationSeconds);

      if (isTimeout) {
        const cached = lastGoodCache.get(cacheKey);
        if (cached) {
          // Circuit-breaker event: fast timeout fired but we have a stale entry
          // we can serve. Log it so the outage is visible without failing the call.
          logger?.warn(
            { from: quoteRequest.from, to: quoteRequest.to, durationMs: durationSeconds * 1000 },
            'fx-client: read timeout — serving stale cached quote',
          );
          return cached;
        }

        // Timeout with no cache entry: propagate as UpstreamReadTimeoutError so
        // the route handler can reply 503 + Retry-After instead of silently
        // returning null (which would hide the outage from the client).
        logger?.warn(
          { from: quoteRequest.from, to: quoteRequest.to, durationMs: durationSeconds * 1000 },
          'fx-client: read timeout — no cached quote available',
        );
        throw new UpstreamReadTimeoutError(TARGET, ENDPOINT);
      }

      logger?.warn(
        { err, from: quoteRequest.from, to: quoteRequest.to },
        'fx-client: quote request failed - continuing without quote',
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return { getQuote };
}
