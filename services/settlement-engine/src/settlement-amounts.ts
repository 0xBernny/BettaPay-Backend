/**
 * settlement-amounts.ts
 *
 * Pure precision-arithmetic helpers for settlement fee calculations.
 * No I/O, no environment dependencies — safe to import in tests.
 *
 * Precision strategy
 * ──────────────────
 * BigNumber.js is used for all arithmetic with ROUND_DOWN to ensure
 * fees are never over-charged due to rounding.  All amounts are
 * returned as full-precision decimal strings, preserving the number
 * of decimal places present in the original input.
 */

import BigNumber from 'bignumber.js';
import type { Amount } from '@bettapay/shared-types';

// Always round DOWN (conservative/banker-safe), never use scientific notation
BigNumber.config({ ROUNDING_MODE: BigNumber.ROUND_DOWN, EXPONENTIAL_AT: [-20, 40] });

export interface SettlementAmounts {
  /** Exact original input — no rounding applied */
  grossAmount: Amount;
  /** Fee deducted from gross, rounded DOWN to input decimal places */
  feeAmount: Amount;
  /** grossAmount − feeAmount, same decimal places as input */
  netAmount: Amount;
  /** Fee audit snapshot for forensic analysis (#330) */
  feeSnapshot: FeeAuditSnapshot;
}

export interface FeeAuditSnapshot {
  feeBpsApplied: number;
  maxFeeBpsApplied: number;
  discountApplied: number;
  monthlyVolumeAtTime: number;
  feeVersion: string;
  capApplied?: boolean;
  uncappedFee?: string;
}

export interface FeeConfig {
  feeBps: number;
  maxFeeBps?: number;
  maxFeeThreshold?: string;
}

/**
 * Computes fee and net amounts with full decimal precision using BigNumber.
 * Supports optional maximum fee caps for high-value settlements.
 *
 * Invariants (must hold for every valid non-negative gross amount and
 * feeBps in [0, 10000]):
 * - `feeAmount + netAmount === grossAmount` (exact decimal equality)
 * - `feeAmount >= 0` and `netAmount <= grossAmount` (never a negative fee)
 * - `feeAmount` has at most as many decimal places as `grossAmount`
 * - When `feeBps === 0`, `feeAmount` is zero with the input's decimal places
 * - ROUND_DOWN: `feeAmount <= grossAmount * feeBps / 10000` (never overcharge)
 * - When cap is active: `feeAmount <= grossAmount * maxFeeBps / 10000`
 *
 * @param grossAmountStr  Validated numeric string from the request body.
 * @param feeConfig       Fee configuration with optional cap parameters.
 * @returns               { grossAmount, feeAmount, netAmount } as full-precision strings.
 *
 * @example
 *   computeSettlementAmounts('100.123456', { feeBps: 100 })
 *   // → { grossAmount: '100.123456', feeAmount: '1.001234', netAmount: '99.122222' }
 *
 * @example
 *   // With fee cap: $100K gross, 10% uncapped, 2% cap above $10K threshold
 *   computeSettlementAmounts('100000', { feeBps: 1000, maxFeeBps: 200, maxFeeThreshold: '10000' })
 *   // → { grossAmount: '100000', feeAmount: '2000', netAmount: '98000' }  // capped at 2%
 */
export function computeSettlementAmounts(
  grossAmountStr: Amount,
  feeConfig: number | FeeConfig
): SettlementAmounts {
  // Backward compatibility: accept plain number as feeBps
  const config: FeeConfig = typeof feeConfig === 'number' 
    ? { feeBps: feeConfig } 
    : feeConfig;

  const { feeBps, maxFeeBps, maxFeeThreshold } = config;
  const gross = new BigNumber(grossAmountStr);

  // Compute uncapped fee
  const uncappedFee = gross.multipliedBy(feeBps).dividedBy(10_000);

  let finalFee = uncappedFee;
  let capApplied = false;

  // Apply cap if threshold is exceeded and maxFeeBps is configured
  if (maxFeeBps !== undefined && maxFeeThreshold !== undefined) {
    const threshold = new BigNumber(maxFeeThreshold);
    
    if (gross.isGreaterThan(threshold)) {
      const cappedFee = gross.multipliedBy(maxFeeBps).dividedBy(10_000);
      
      if (cappedFee.isLessThan(uncappedFee)) {
        finalFee = cappedFee;
        capApplied = true;
      }
    }
  }

  // Preserve the same decimal places as the original input string.
  const inputDecimals = (grossAmountStr.split('.')[1] ?? '').length;
  const feeStr = finalFee.toFixed(inputDecimals, BigNumber.ROUND_DOWN);
  const netStr = gross.minus(feeStr).toFixed(inputDecimals);

  const feeSnapshot: FeeAuditSnapshot = {
    feeBpsApplied: feeBps,
    maxFeeBpsApplied: capApplied ? (maxFeeBps ?? feeBps) : feeBps,
    discountApplied: 0,
    monthlyVolumeAtTime: parseFloat(grossAmountStr),
    feeVersion: '1.1',
    ...(capApplied && {
      capApplied: true,
      uncappedFee: uncappedFee.toFixed(inputDecimals, BigNumber.ROUND_DOWN),
    }),
  };

  return {
    grossAmount: grossAmountStr,   // exact original — zero rounding
    feeAmount: feeStr,
    netAmount: netStr,
    feeSnapshot,
  };
}
