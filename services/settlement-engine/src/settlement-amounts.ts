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

export interface FeeScheduleItem {
  asset: string;
  bps: number;
}

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
}

/**
 * Computes fee and net amounts with full decimal precision using BigNumber.
 *
 * Invariants (must hold for every valid non-negative gross amount and
 * feeBps in [0, 10000]):
 * - `feeAmount + netAmount === grossAmount` (exact decimal equality)
 * - `feeAmount >= 0` and `netAmount <= grossAmount` (never a negative fee)
 * - `feeAmount` has at most as many decimal places as `grossAmount`
 * - When `feeBps === 0`, `feeAmount` is zero with the input's decimal places
 * - ROUND_DOWN: `feeAmount <= grossAmount * feeBps / 10000` (never overcharge)
 *
 * @param grossAmountStr  Validated numeric string from the request body.
 * @param feeBps          Fee in basis points (e.g. 100 = 1%).
 * @returns               { grossAmount, feeAmount, netAmount } as full-precision strings.
 *
 * @example
 *   computeSettlementAmounts('100.123456', 100)
 *   // → { grossAmount: '100.123456', feeAmount: '1.001234', netAmount: '99.122222' }
 */
export function computeSettlementAmounts(
  grossAmountStr: Amount,
  feeBps: number
): SettlementAmounts {
  const gross = new BigNumber(grossAmountStr);

  // fee = gross × feeBps / 10 000   (rounded DOWN to preserve net accuracy)
  const fee = gross.multipliedBy(feeBps).dividedBy(10_000);

  // Preserve the same decimal places as the original input string.
  const inputDecimals = (grossAmountStr.split('.')[1] ?? '').length;
  const feeStr = fee.toFixed(inputDecimals, BigNumber.ROUND_DOWN);
  const netStr = gross.minus(feeStr).toFixed(inputDecimals);

  const feeSnapshot: FeeAuditSnapshot = {
    feeBpsApplied: feeBps,
    maxFeeBpsApplied: feeBps,
    discountApplied: 0,
    monthlyVolumeAtTime: parseFloat(grossAmountStr),
    feeVersion: '1.0',
  };

  return {
    grossAmount: grossAmountStr,   // exact original — zero rounding
    feeAmount: feeStr,
    netAmount: netStr,
    feeSnapshot,
  };
}

/**
 * Computes the applicable fee BPS for a given asset based on fee schedules.
 * Falls back to defaultBps if no matching schedule is found.
 *
 * @param asset       The asset code (e.g., 'USDC', 'EURT')
 * @param feeSchedules  Array of fee schedule items [{ asset, bps }]
 * @param defaultBps    Default fee BPS to use if no schedule matches
 * @returns           The applicable fee BPS for the asset
 */
export function resolveFeeBpsForAsset(
  asset: string,
  feeSchedules: FeeScheduleItem[] | undefined,
  defaultBps: number
): number {
  if (!feeSchedules || feeSchedules.length === 0) {
    return defaultBps;
  }
  const schedule = feeSchedules.find((s) => s.asset === asset);
  return schedule ? schedule.bps : defaultBps;
}

/**
 * Computes fee and net amounts with full decimal precision using BigNumber,
 * resolving the fee BPS from fee schedules based on the asset.
 *
 * @param grossAmountStr  Validated numeric string from the request body.
 * @param asset           The asset code (e.g., 'USDC', 'EURT')
 * @param feeSchedules    Array of fee schedule items [{ asset, bps }]
 * @param defaultBps      Default fee BPS to use if no schedule matches
 * @returns               { grossAmount, feeAmount, netAmount } as full-precision strings.
 */
export function computeSettlementAmountsWithSchedule(
  grossAmountStr: Amount,
  asset: string,
  feeSchedules: FeeScheduleItem[] | undefined,
  defaultBps: number
): SettlementAmounts {
  const feeBps = resolveFeeBpsForAsset(asset, feeSchedules, defaultBps);
  return computeSettlementAmounts(grossAmountStr, feeBps);
}
