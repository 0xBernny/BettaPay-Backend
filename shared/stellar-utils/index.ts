/**
 * Stellar network utilities
 * Provides helpers for interacting with the Stellar blockchain
 */

import { StrKey, Keypair } from '@stellar/stellar-sdk';

export function validateStellarAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address);
}

/**
 * Generate a random Ed25519 Stellar keypair.
 *
 * The returned `secretKey` is the master seed and **must** be stored
 * securely (e.g. encrypted at rest, environment variable, or secret
 * manager). It must **never** be logged, included in error messages,
 * or sent over unencrypted channels.
 *
 * @returns An object with `publicKey` (G…) and `secretKey` (S…).
 */
export function generateStellarKeypair(): { publicKey: string; secretKey: string } {
  const keypair = Keypair.random();
  return { publicKey: keypair.publicKey(), secretKey: keypair.secret() };
}

// Convert decimal string to stroops (string of integer stroops)
export function toStellarAmount(decimalStr: string, decimals = 7): string {
  // naive conversion: multiply decimal by 10^decimals
  const [whole, frac = ''] = decimalStr.split('.');
  const paddedFrac = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const stroops = BigInt(whole || '0') * BigInt(10 ** decimals) + BigInt(paddedFrac || '0');
  return stroops.toString();
}

export function fromStellarAmount(stroopsStr: string, decimals = 7): string {
  const n = BigInt(stroopsStr);
  const whole = n / BigInt(10 ** decimals);
  const frac = (n % BigInt(10 ** decimals)).toString().padStart(decimals, '0').replace(/0+$/,'');
  return frac ? `${whole.toString()}.${frac}` : whole.toString();
}

export function formatAmount(amount: string, decimals: number = 7): string {
  // Provided for backwards compatibility: expects stroops input
  try {
    return fromStellarAmount(amount, decimals);
  } catch {
    return amount;
  }
}

export function buildPaymentOperation(params: { source?: string; destination: string; asset: string; amount: string }){
  // Placeholder: return normalized operation object
  return {
    type: 'payment',
    source: params.source || null,
    destination: params.destination,
    asset: params.asset,
    amount: params.amount
  };
}
