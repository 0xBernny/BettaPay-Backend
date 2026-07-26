import { propagateTracingHeaders } from '@bettapay/validation';
import { defaultInterServiceMetrics, type InterServiceMetrics } from './inter-service-metrics.js';

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

export const DEFAULT_FX_TIMEOUT_MS = 5_000;

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
