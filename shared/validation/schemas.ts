import { z } from 'zod';
import { validateStellarAddress } from '@bettapay/stellar-utils';

const MAX_MERCHANT_SETTINGS_KEYS = 50;
const MAX_MERCHANT_SETTINGS_SIZE = 10 * 1024;

// Entity schemas
export const idSchema = z.string().min(1);
export const isoDateString = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid ISO date string' });

export const userSchema = z.object({
  id: idSchema,
  email: z.string().email(),
  displayName: z.string().optional(),
  createdAt: isoDateString,
  metadata: z.record(z.any()).optional()
});

export const merchantSchema = z.object({
  id: idSchema,
  name: z.string(),
  ownerId: idSchema,
  createdAt: isoDateString,
  settings: z.record(z.any()).optional()
});

export const walletSchema = z.object({
  id: idSchema,
  ownerId: idSchema,
  address: z.string(),
  asset: z.string(),
  balance: z.string()
});

export const transactionSchema = z.object({
  id: idSchema,
  type: z.enum(['payment','settlement','anchor_transfer','fx']),
  amount: z.string(),
  asset: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  createdAt: isoDateString,
  metadata: z.record(z.any()).optional()
});

export const paymentSchema = z.object({
  id: idSchema,
  merchantId: idSchema,
  payerId: idSchema.optional(),
  amount: z.string(),
  asset: z.string(),
  status: z.enum(['initiated','completed','failed','cancelled']),
  createdAt: isoDateString,
  reference: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

export const settlementSchema = z.object({
  id: idSchema,
  merchantId: idSchema,
  totalAmount: z.string(),
  asset: z.string(),
  initiatedAt: isoDateString,
  completedAt: isoDateString.optional(),
  status: z.enum(['pending','processing','completed','failed']),
  metadata: z.record(z.any()).optional()
});

export const fxQuoteSchema = z.object({
  id: idSchema,
  fromCurrency: z.string(),
  toCurrency: z.string(),
  rate: z.string(),
  expiresAt: isoDateString
});

export const billPaymentSchema = z.object({
  id: idSchema,
  merchantId: idSchema,
  amount: z.string(),
  asset: z.string(),
  billerReference: z.string(),
  status: z.enum(['initiated','paid','failed']),
  createdAt: isoDateString
});

export const anchorTransferSchema = z.object({
  id: idSchema,
  anchorName: z.string(),
  amount: z.string(),
  asset: z.string(),
  externalReference: z.string().optional(),
  status: z.enum(['pending','completed','failed']),
  createdAt: isoDateString
});

// Event schemas
export const paymentInitiatedEvent = z.object({
  id: idSchema,
  type: z.literal('PaymentInitiated'),
  occurredAt: isoDateString,
  payload: z.object({ payment: paymentSchema })
});

export const paymentCompletedEvent = z.object({
  id: idSchema,
  type: z.literal('PaymentCompleted'),
  occurredAt: isoDateString,
  payload: z.object({ payment: paymentSchema, transaction: transactionSchema })
});

export const settlementTriggeredEvent = z.object({
  id: idSchema,
  type: z.literal('SettlementTriggered'),
  occurredAt: isoDateString,
  payload: z.object({ settlement: settlementSchema })
});

export const fxExecutedEvent = z.object({
  id: idSchema,
  type: z.literal('FXExecuted'),
  occurredAt: isoDateString,
  payload: z.object({ quote: fxQuoteSchema, transaction: transactionSchema })
});

export const billPaidEvent = z.object({
  id: idSchema,
  type: z.literal('BillPaid'),
  occurredAt: isoDateString,
  payload: z.object({ billPayment: billPaymentSchema })
});

export const anchorSettledEvent = z.object({
  id: idSchema,
  type: z.literal('AnchorSettled'),
  occurredAt: isoDateString,
  payload: z.object({ anchorTransfer: anchorTransferSchema })
});

export const eventSchemas = z.discriminatedUnion('type', [
  paymentInitiatedEvent,
  paymentCompletedEvent,
  settlementTriggeredEvent,
  fxExecutedEvent,
  billPaidEvent,
  anchorSettledEvent
]);

// Export types inferred from schemas
export type User = z.infer<typeof userSchema>;
export type Merchant = z.infer<typeof merchantSchema>;
export type Wallet = z.infer<typeof walletSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type Settlement = z.infer<typeof settlementSchema>;
export type FXQuote = z.infer<typeof fxQuoteSchema>;
export type BillPayment = z.infer<typeof billPaymentSchema>;
export type AnchorTransfer = z.infer<typeof anchorTransferSchema>;
export type EventPayloads = z.infer<typeof eventSchemas>;

// Convenience parsers
export function parseEvent(raw: unknown) {
  return eventSchemas.parse(raw);
}

export function safeParseEvent(raw: unknown) {
  return eventSchemas.safeParse(raw);
}

// ─── Request Body Schemas (used by API Gateway route handlers) ────────────────

export const CreateMerchantBody = z.object({
  id: z.string().min(1, 'id is required'),
  name: z
    .string()
    .min(3, 'merchant name must be at least 3 characters')
    .max(100, 'merchant name must be at most 100 characters'),
  ownerId: z
    .string()
    .refine((val) => validateStellarAddress(val), 'ownerId must be a valid Stellar address')
    .optional(),
  settings: z
    .record(z.unknown())
    .refine(
      (val) => Object.keys(val).length <= MAX_MERCHANT_SETTINGS_KEYS,
      'settings must contain at most 50 keys',
    )
    .refine(
      (val) => JSON.stringify(val).length <= MAX_MERCHANT_SETTINGS_SIZE,
      'settings must be 10240 bytes or less',
    )
    .optional(),
});

export const CreatePaymentBody = z.object({
  merchantId: z.string().min(1, 'merchantId is required'),
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'amount must be a numeric string'),
  asset: z.string().min(1, 'asset is required'),
  payerId: z.string().optional(),
  reference: z.string().optional(),
});

export const CreateSettlementBody = z.object({
  merchantId: z.string().min(1, 'merchantId is required'),
  amount: z.string().regex(/^\d+(\.\d+)?$/, 'amount must be a numeric string'),
  asset: z.string().min(1, 'asset is required'),
});

export const AuthTokenBody = z.object({
  merchantId: z.string().min(1, 'merchantId is required'),
  secret: z.string().min(1, 'secret is required'),
});

export type CreateMerchantBody = z.infer<typeof CreateMerchantBody>;
export type CreatePaymentBody = z.infer<typeof CreatePaymentBody>;
export type CreateSettlementBody = z.infer<typeof CreateSettlementBody>;
export type AuthTokenBody = z.infer<typeof AuthTokenBody>;
