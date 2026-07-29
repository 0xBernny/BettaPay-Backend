import { z } from 'zod';
import { Redis } from 'ioredis';
import dns from 'node:dns';
import { createValidationContext } from './envAwareSchema.js';

const PRIVATE_HOST_PATTERN =
  /^(localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|::1|\[::1\]|0\.0\.0\.0)$/i;

function isPrivateOrLocalhost(urlString: string): boolean {
  try {
    const { hostname } = new URL(urlString);
    return PRIVATE_HOST_PATTERN.test(hostname);
  } catch {
    return false;
  }
}

export const WEBHOOK_VALIDATE_RATE_LIMIT = 10;
export const WEBHOOK_VALIDATE_RATE_WINDOW_SEC = 60;
export const DNS_CACHE_TTL_MS = 60_000;
const dnsCache = new Map<string, { addresses: string[]; timestamp: number }>();

export async function checkWebhookRateLimit(redis: Redis, ip: string): Promise<boolean> {
  const key = `webhook_validate_rate:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WEBHOOK_VALIDATE_RATE_WINDOW_SEC);
  }
  return count <= WEBHOOK_VALIDATE_RATE_LIMIT;
}

export async function resolveWithCache(url: string): Promise<string[]> {
  const { hostname } = new URL(url);
  const cached = dnsCache.get(hostname);
  if (cached && Date.now() - cached.timestamp < DNS_CACHE_TTL_MS) {
    return cached.addresses;
  }
  try {
    const addresses = await dns.promises.resolve4(hostname);
    dnsCache.set(hostname, { addresses, timestamp: Date.now() });
    return addresses;
  } catch {
    return [];
  }
}

export function clearDnsCache(): void {
  dnsCache.clear();
}

export interface WebhookValidationResult {
  valid: boolean;
  error?: string;
  statusCode?: number;
}

export async function validateWebhookUrl(
  url: string,
  redis: Redis,
  ip: string,
  options?: { fetch?: typeof globalThis.fetch },
): Promise<WebhookValidationResult> {
  const allowed = await checkWebhookRateLimit(redis, ip);
  if (!allowed) {
    return { valid: false, error: 'Rate limit exceeded. Please try again later.', statusCode: 429 };
  }

  const addresses = await resolveWithCache(url);
  if (addresses.length === 0) {
    return { valid: false, error: 'Could not resolve webhook URL', statusCode: 400 };
  }

  const doFetch = options?.fetch ?? globalThis.fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await doFetch(url, { method: 'HEAD', signal: controller.signal });
    if (response.ok) {
      return { valid: true, statusCode: response.status };
    }
    return { valid: false, error: 'Webhook URL is not reachable', statusCode: response.status };
  } catch {
    return { valid: false, error: 'Webhook URL is not reachable', statusCode: 400 };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createWebhookUrlSchema(nodeEnv?: string) {
  const { isProduction } = createValidationContext(nodeEnv);

  return z
    .string()
    .url('Webhook URL must be a valid URL')
    .max(2048, 'Webhook URL must not exceed 2048 characters')
    .superRefine((url, ctx) => {
      if (!isProduction) return;

      if (!url.startsWith('https://')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Webhook URLs must use HTTPS in production.',
        });
      }

      if (isPrivateOrLocalhost(url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Webhook URL must not point to localhost or private IP addresses',
        });
      }
    });
}

export const WebhookUrlSchema = createWebhookUrlSchema();

export type WebhookUrl = z.infer<typeof WebhookUrlSchema>;
