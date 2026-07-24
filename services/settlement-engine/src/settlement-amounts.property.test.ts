/**
 * settlement-amounts.property.test.ts
 *
 * Property-based tests for computeSettlementAmounts() using fast-check.
 * These assert invariants that must hold for all valid monetary strings and
 * feeBps in [0, 10000], complementing the example-based suite in
 * settlement-precision.test.ts.
 *
 * Regression signal: replacing ROUND_DOWN with ROUND_UP in fee.toFixed(...)
 * (or relying on ROUND_HALF_UP) causes the never-overcharge property to fail.
 */

import test from 'tape';
import fc from 'fast-check';
import BigNumber from 'bignumber.js';
import { computeSettlementAmounts } from './settlement-amounts.js';

/** Count decimal places in a monetary string (0 when there is no fractional part). */
function decimalPlaces(amount: string): number {
  return (amount.split('.')[1] ?? '').length;
}

/**
 * Valid non-negative monetary strings: integer part up to 9 digits, optional
 * fractional part of 1–6 digits (covers USDC-style precision and integers).
 */
const monetaryAmountArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.integer({ min: 0, max: 999_999_999 }),
    fc.integer({ min: 0, max: 6 })
  )
  .chain(([intPart, decimals]) => {
    if (decimals === 0) {
      return fc.constant(String(intPart));
    }
    const maxFrac = 10 ** decimals - 1;
    return fc.integer({ min: 0, max: maxFrac }).map((frac) => {
      const fracStr = String(frac).padStart(decimals, '0');
      return `${intPart}.${fracStr}`;
    });
  });

const feeBpsArb = fc.integer({ min: 0, max: 10_000 });

const settlementInputArb = fc.tuple(monetaryAmountArb, feeBpsArb);

test('property: feeAmount + netAmount === grossAmount for all inputs', (t) => {
  t.plan(1);
  t.doesNotThrow(() => {
    fc.assert(
      fc.property(settlementInputArb, ([gross, feeBps]) => {
        const { grossAmount, feeAmount, netAmount } = computeSettlementAmounts(gross, feeBps);
        const sum = new BigNumber(feeAmount).plus(netAmount);
        return sum.isEqualTo(grossAmount);
      }),
      { numRuns: 200 }
    );
  });
});

test('property: feeAmount >= 0 and netAmount <= grossAmount', (t) => {
  t.plan(1);
  t.doesNotThrow(() => {
    fc.assert(
      fc.property(settlementInputArb, ([gross, feeBps]) => {
        const { feeAmount, netAmount, grossAmount } = computeSettlementAmounts(gross, feeBps);
        const fee = new BigNumber(feeAmount);
        const net = new BigNumber(netAmount);
        const g = new BigNumber(grossAmount);
        return fee.isGreaterThanOrEqualTo(0) && net.isLessThanOrEqualTo(g);
      }),
      { numRuns: 200 }
    );
  });
});

test('property: feeAmount has at most the same decimal places as grossAmount', (t) => {
  t.plan(1);
  t.doesNotThrow(() => {
    fc.assert(
      fc.property(settlementInputArb, ([gross, feeBps]) => {
        const { feeAmount, grossAmount } = computeSettlementAmounts(gross, feeBps);
        return decimalPlaces(feeAmount) <= decimalPlaces(grossAmount);
      }),
      { numRuns: 200 }
    );
  });
});

test('property: feeBps === 0 yields a zero fee matching input decimal places', (t) => {
  t.plan(1);
  t.doesNotThrow(() => {
    fc.assert(
      fc.property(monetaryAmountArb, (gross) => {
        const { feeAmount } = computeSettlementAmounts(gross, 0);
        const decimals = decimalPlaces(gross);
        const expected =
          decimals === 0 ? '0' : `0.${'0'.repeat(decimals)}`;
        return feeAmount === expected && new BigNumber(feeAmount).isZero();
      }),
      { numRuns: 100 }
    );
  });
});

test('property: ROUND_DOWN never overcharges (fee <= exact gross × bps / 10000)', (t) => {
  t.plan(1);
  t.doesNotThrow(() => {
    fc.assert(
      fc.property(settlementInputArb, ([gross, feeBps]) => {
        const { feeAmount } = computeSettlementAmounts(gross, feeBps);
        const exact = new BigNumber(gross).multipliedBy(feeBps).dividedBy(10_000);
        return new BigNumber(feeAmount).isLessThanOrEqualTo(exact);
      }),
      { numRuns: 200 }
    );
  });
});
