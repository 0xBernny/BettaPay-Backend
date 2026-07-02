import { z } from 'zod';
import { createValidationContext } from './envAwareSchema.js';

/**
 * Webhook URL schema.
 * @envSpecific HTTPS enforcement is only applied in production (NODE_ENV=production).
 * In development, HTTP URLs are accepted to simplify local testing.
 */
export function createWebhookUrlSchema(nodeEnv?: string) {
  const { isProduction } = createValidationContext(nodeEnv);

  return z.string().url('url must be a valid URL').superRefine((url, ctx) => {
    if (isProduction && !url.startsWith('https://')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Webhook URLs must use HTTPS in production.',
      });
    }
  });
}
