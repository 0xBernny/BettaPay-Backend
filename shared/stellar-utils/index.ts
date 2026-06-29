/**
 * Stellar network utilities
 * Provides helpers for interacting with the Stellar blockchain
 */

import { StrKey } from '@stellar/stellar-sdk';
import type { Amount, Stroops } from '@bettapay/shared-types';

export function validateStellarAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address);
}

/**
 * Builds a normalized Stellar set-options operation object for multi-signature
 * account configuration. Supports master weight, signing thresholds, and additional
 * signers. All threshold and weight values must be integers in the range 0–255.
 *
 * @param params.masterWeight  Weight of the account's master key (0 removes signing authority)
 * @param params.lowThreshold  Threshold for low-security operations
 * @param params.medThreshold  Threshold for medium-security operations
 * @param params.highThreshold Threshold for high-security operations
 * @param params.signer        Additional signer to add or remove from the account
 * @throws {Error} When any threshold or weight value is outside 0–255
 * @throws {Error} When signer.key is not a valid Stellar address
 */
export function buildSetOptionsOp(params: {
  masterWeight?: number;
  lowThreshold?: number;
  medThreshold?: number;
  highThreshold?: number;
  signer?: { key: string; weight: number };
}): {
  type: 'setOptions';
  masterWeight: number | null;
  lowThreshold: number | null;
  medThreshold: number | null;
  highThreshold: number | null;
  signer: { key: string; weight: number } | null;
} {
  const { masterWeight, lowThreshold, medThreshold, highThreshold, signer } = params;

  const thresholdFields: Record<string, number | undefined> = {
    masterWeight,
    lowThreshold,
    medThreshold,
    highThreshold,
  };

  for (const [field, value] of Object.entries(thresholdFields)) {
    if (value !== undefined) {
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new Error(`${field} must be an integer between 0 and 255`);
      }
    }
  }

  if (signer !== undefined) {
    if (!validateStellarAddress(signer.key)) {
      throw new Error('signer.key must be a valid Stellar address');
    }
    if (!Number.isInteger(signer.weight) || signer.weight < 0 || signer.weight > 255) {
      throw new Error('signer.weight must be an integer between 0 and 255');
    }
  }

  return {
    type: 'setOptions',
    masterWeight: masterWeight ?? null,
    lowThreshold: lowThreshold ?? null,
    medThreshold: medThreshold ?? null,
    highThreshold: highThreshold ?? null,
    signer: signer ?? null,
  };
}

/**
 * Converts a decimal string amount to Stellar stroops (the smallest unit).
 *
 * Expected format: a non-negative decimal string matching `/^\d+(\.\d+)?$/`
 * (e.g. `"100"`, `"0.5"`, `"100.0000001"`). Negative numbers, empty strings,
 * scientific notation, and leading/trailing spaces are all rejected.
 * If the fractional part has more digits than `decimals`, excess digits are truncated.
 *
 * @param decimalStr - Non-negative numeric string representing the amount.
 * @param decimals   - Number of decimal places for the asset (default 7, matching XLM/USDC).
 * @returns The equivalent amount expressed as a string of integer stroops.
 * @throws {TypeError} If `decimalStr` is not a valid non-negative numeric string.
 */
export function toStellarAmount(decimalStr: Amount, decimals = 7): Stroops {
  if (!/^\d+(\.\d+)?$/.test(decimalStr)) {
    throw new TypeError('toStellarAmount: input must be a valid numeric string');
  }
  const [whole, frac = ''] = decimalStr.split('.');
  const paddedFrac = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const stroops = BigInt(whole || '0') * BigInt(10 ** decimals) + BigInt(paddedFrac || '0');
  return stroops.toString();
}

export function fromStellarAmount(stroopsStr: Stroops, decimals = 7): Amount {
  const n = BigInt(stroopsStr);
  const whole = n / BigInt(10 ** decimals);
  const frac = (n % BigInt(10 ** decimals)).toString().padStart(decimals, '0').replace(/0+$/,'');
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

export function formatAmount(amount: Stroops, decimals: number = 7): Amount {
  // Provided for backwards compatibility: expects stroops input
  try {
    return fromStellarAmount(amount, decimals);
  } catch {
    return amount;
  }
}

export function buildPaymentOperation(params: { source?: string; destination: string; asset: string; amount: Amount }){
  // Placeholder: return normalized operation object
  return {
    type: 'payment',
    source: params.source || null,
    destination: params.destination,
    asset: params.asset,
    amount: params.amount
  };
}

/**
 * Builds a properly encoded Horizon API URL for the specified resource.
 * Handles trailing slashes in base URL and encodes query parameters.
 *
 * @param baseUrl - The Horizon API base URL (e.g., 'https://horizon.stellar.org' or 'https://horizon.stellar.org/')
 * @param resource - The Horizon resource path (e.g., 'accounts', 'transactions', 'operations', 'payments', 'effects')
 * @param params - Optional query parameters to include in the URL
 * @returns The fully constructed URL string
 *
 * @example
 * // Basic resource URL
 * buildHorizonUrl('https://horizon.stellar.org', 'accounts');
 * // Returns: 'https://horizon.stellar.org/accounts'
 *
 * @example
 * // With query parameters
 * buildHorizonUrl('https://horizon.stellar.org', 'transactions', { limit: 10, order: 'desc' });
 * // Returns: 'https://horizon.stellar.org/transactions?limit=10&order=desc'
 *
 * @example
 * // With trailing slash in base URL
 * buildHorizonUrl('https://horizon.stellar.org/', 'payments', { asset: 'USD:GABC...' });
 * // Returns: 'https://horizon.stellar.org/payments?asset=USD%3AGABC...'
 *
 * @example
 * // Special characters are encoded
 * buildHorizonUrl('https://horizon.stellar.org', 'accounts', { signer: 'GABC... =DEF' });
 * // Returns: 'https://horizon.stellar.org/accounts?signer=GABC...%20%3DDEF'
 */
export function buildHorizonUrl(
  baseUrl: string,
  resource: string,
  params?: Record<string, any>
): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const url = new URL(`${normalizedBase}/${resource}`);

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    url.search = searchParams.toString();
  }

  return url.toString();
}
