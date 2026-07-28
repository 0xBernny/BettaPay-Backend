import { z } from 'zod';
import { createValidationContext } from './envAwareSchema.js';

/**
 * Matches hostnames that resolve to loopback / RFC1918 private ranges.
 * Used to stop merchants from registering webhooks that point back into
 * our own infrastructure (a classic SSRF vector) once we're in production.
 */
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

/**
 * Webhook URL schema.
 * @envSpecific HTTPS enforcement is only applied in production (NODE_ENV=production).
 * In development, HTTP URLs are accepted to simplify local testing.
 */
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