import { propagateTracingHeaders } from '@bettapay/validation';

type IncomingHeaders = Record<string, string | string[] | undefined>;

interface MinimalLogger {
  warn: (obj: unknown, msg?: string) => void;
  info: (obj: unknown, msg?: string) => void;
}

export interface FxClientOptions {
  baseUrl: string;
  serviceToken?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  logger?: MinimalLogger;
}

export interface FxQuote {
  quoteId: string | null;
  from: string;
  to: string;
  amount: string;
  result: string;
  rate: string;
  slippageBps: number;
  slippageLimit: string;
  expiresAt: string;
}

export interface FxClientResult {
  status: number;
  body: FxQuote;
}

export interface FxClient {
  getQuote(
    from: string,
    to: string,
    amount: string,
    incomingHeaders?: IncomingHeaders
  ): Promise<FxClientResult>;
}

export const DEFAULT_FX_TIMEOUT_MS = 5_000;

export class FxEngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FxEngineUnavailableError';
  }
}

export function createFxClient(options: FxClientOptions): FxClient {
  const {
    baseUrl,
    serviceToken,
    timeoutMs = DEFAULT_FX_TIMEOUT_MS,
    fetchImpl = fetch,
    logger,
  } = options;

  const root = baseUrl.replace(/\/+$/, '');
  const authHeaders: Record<string, string> = serviceToken
    ? { 'x-service-token': serviceToken }
    : {};

  async function getQuote(
    from: string,
    to: string,
    amount: string,
    incomingHeaders: IncomingHeaders = {}
  ): Promise<FxClientResult> {
    const params = new URLSearchParams({ from, to, amount });
    const url = `${root}/api/quote?${params.toString()}`;
    const headers = propagateTracingHeaders(incomingHeaders, {
      ...authHeaders,
      'content-type': 'application/json',
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      const body = await response.json() as FxQuote;

      logger?.info(
        { from, to, amount, quoteId: body.quoteId, status: response.status },
        'fx-engine quote fetched'
      );

      return { status: response.status, body };
    } catch (err) {
      logger?.warn({ err, from, to, amount }, 'fx-engine request failed');
      throw new FxEngineUnavailableError(
        err instanceof Error ? err.message : 'fx-engine unavailable'
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return { getQuote };
}
