import { propagateTracingHeaders } from '@bettapay/validation';

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
  } = options;

  const root = baseUrl.replace(/\/+$/, '');

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
      const durationMs = Date.now() - startedAt;

      if (!res.ok) {
        logger?.warn(
          { status: res.status, durationMs, from: quoteRequest.from, to: quoteRequest.to },
          'fx-client: non-OK quote response - continuing without quote',
        );
        return null;
      }

      const body = (await res.json()) as FxQuoteResponse;
      logger?.info?.(
        { durationMs, from: quoteRequest.from, to: quoteRequest.to },
        'fx-client: quote fetched',
      );
      return body;
    } catch (err) {
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
