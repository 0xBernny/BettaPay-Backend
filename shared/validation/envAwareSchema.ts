import { z } from 'zod';

export type Env = 'production' | 'development' | 'test' | string;

export interface ValidationContext {
  isProduction: boolean;
  env: Env;
}

export function createValidationContext(nodeEnv: Env = process.env.NODE_ENV ?? 'development'): ValidationContext {
  return {
    isProduction: nodeEnv === 'production',
    env: nodeEnv,
  };
}
