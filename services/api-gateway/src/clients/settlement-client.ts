import { propagateTracingHeaders } from '@bettapay/validation';

type IncomingHeaders = Record<string, string | string[] | undefined>;

interface MinimalLogger {
  warn: (obj: unknown, msg?: string) => void;
}

export interface SettlementClientOptions {
  baseUrl: string;
  serviceToken?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  logger?: MinimalLogger;
}

export interface SettlementClientResult {
  status: number;
  body: unknown;
  contentType: string;
}

export interface SettlementClient {
  createSettlement(
    payload: unknown,
    incomingHeaders?: IncomingHeaders
  ): Promise<SettlementClientResult>;
}

export const DEFAULT_SETTLEMENT_TIMEOUT_MS = 5_000;

export class SettlementEngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettlementEngineUnavailableError';
  }
}

export function createSettlementClient(options: SettlementClientOptions): SettlementClient {
  const {
    baseUrl,
    serviceToken,
    timeoutMs = DEFAULT_SETTLEMENT_TIMEOUT_MS,
    fetchImpl = fetch,
    logger,
  } = options;

  const root = baseUrl.replace(/\/+$/, '');
  const authHeaders: Record<string, string> = serviceToken
    ? { 'x-service-token': serviceToken }
    : {};

  async function createSettlement(
    payload: unknown,
    incomingHeaders: IncomingHeaders = {}
  ): Promise<SettlementClientResult> {
    const url = `${root}/api/settlements`;
    const headers = propagateTracingHeaders(incomingHeaders, {
      ...authHeaders,
      'content-type': 'application/json',
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') ?? 'application/json';
      const body = contentType.includes('application/json')
        ? await response.json()
        : await response.text();

      return { status: response.status, body, contentType };
    } catch (err) {
      logger?.warn({ err }, 'settlement-client: settlement-engine request failed');
      throw new SettlementEngineUnavailableError(
        err instanceof Error ? err.message : 'settlement-engine unavailable'
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return { createSettlement };
}
