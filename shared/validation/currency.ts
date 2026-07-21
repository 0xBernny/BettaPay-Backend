import { z } from 'zod';

// Extend this array to support new currencies
export const CurrencyCode = z.enum(['USDC', 'EURT', 'NGN']);

export type CurrencyCode = z.infer<typeof CurrencyCode>;
