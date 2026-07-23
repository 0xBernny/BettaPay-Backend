import { ErrorCodes, createErrorResponse } from '@bettapay/validation';
import type { ErrorResponse } from '@bettapay/validation';

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: ErrorResponse };

export function validateCurrencyPair(
  rawFrom: string,
  rawTo: string,
  supportedCurrencies: string[],
): ValidationResult {
  const from = rawFrom.toUpperCase();
  const to = rawTo.toUpperCase();

  const unsupported: string[] = [];
  if (!supportedCurrencies.includes(from)) unsupported.push(from);
  if (!supportedCurrencies.includes(to)) unsupported.push(to);

  if (unsupported.length > 0) {
    return {
      valid: false,
      error: createErrorResponse(
        ErrorCodes.UNSUPPORTED_CURRENCY_PAIR,
        `Unsupported currency: ${unsupported.join(', ')}`,
        { unsupportedCurrencies: unsupported, supportedCurrencies },
      ),
    };
  }

  if (from === to) {
    return {
      valid: false,
      error: createErrorResponse(
        ErrorCodes.INVALID_QUERY,
        'from and to must be different currencies',
      ),
    };
  }

  return { valid: true };
}