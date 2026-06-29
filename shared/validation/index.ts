import { z } from 'zod';

export * from './schemas.js';
import "dotenv/config";

// Backend environment schema — all critical values are required.
// Services will refuse to start if any required variable is missing.
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform((s) => parseInt(s, 10)).default('3000'),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // CORS — comma-separated origins
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  // Database — required; services crash fast if not provided
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis — optional, falls back to localhost
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Stellar
  STELLAR_RPC_URL: z.string().url().default('https://soroban-testnet.stellar.org'),
  STELLAR_NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),
  STELLAR_HORIZON_URL: z.string().url().default('https://horizon-testnet.stellar.org'),

  // Contract addresses — required; no silent fallbacks in code
  SETTLEMENT_CONTRACT_ID: z.string().min(1, 'SETTLEMENT_CONTRACT_ID is required'),
  GOVERNANCE_CONTRACT_ID: z.string().min(1, 'GOVERNANCE_CONTRACT_ID is required'),
  ADMIN_ADDRESS: z.string().min(1, 'ADMIN_ADDRESS is required'),

  // Service URLs (used by gateway to proxy requests)
  FX_ENGINE_URL: z.string().url().default('http://localhost:3002'),
  SETTLEMENT_ENGINE_URL: z.string().url().default('http://localhost:3001'),
  INDEXER_URL: z.string().url().default('http://localhost:3003'),

  // Event retention configuration (days, 0 = disabled)
  EVENT_RETENTION_DAYS: z.string().transform((s) => parseInt(s, 10)).default('0'),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(env: Record<string, unknown>): Env {
  try {
    return EnvSchema.parse(env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.errors.map((e) => `  ${e.path.join('.')}: ${e.message}`).join('\n');
      throw new Error(`\n[BettaPay] Invalid or missing environment variables:\n${message}\n`);
    }
    throw error;
  }
}
