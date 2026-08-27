import test from 'tape';
import { computeSettlementAmounts, resolveFeeBpsForAsset, computeSettlementAmountsWithSchedule, FeeScheduleItem } from './settlement-amounts.js';

test('resolveFeeBpsForAsset: returns schedule bps for matching asset', (t) => {
  const feeSchedules: FeeScheduleItem[] = [
    { asset: 'USDC', bps: 50 },
    { asset: 'EURT', bps: 75 },
  ];
  t.equal(resolveFeeBpsForAsset('USDC', feeSchedules, 100), 50, 'returns 50 bps for USDC');
  t.equal(resolveFeeBpsForAsset('EURT', feeSchedules, 100), 75, 'returns 75 bps for EURT');
  t.end();
});

test('resolveFeeBpsForAsset: falls back to default when no schedule matches', (t) => {
  const feeSchedules: FeeScheduleItem[] = [
    { asset: 'USDC', bps: 50 },
    { asset: 'EURT', bps: 75 },
  ];
  t.equal(resolveFeeBpsForAsset('XLM', feeSchedules, 100), 100, 'falls back to default for unknown asset');
  t.end();
});

test('resolveFeeBpsForAsset: returns default when feeSchedules is empty', (t) => {
  t.equal(resolveFeeBpsForAsset('USDC', [], 100), 100, 'falls back to default when empty array');
  t.equal(resolveFeeBpsForAsset('USDC', undefined, 100), 100, 'falls back to default when undefined');
  t.end();
});

test('resolveFeeBpsForAsset: case-sensitive asset matching', (t) => {
  const feeSchedules: FeeScheduleItem[] = [
    { asset: 'USDC', bps: 50 },
  ];
  t.equal(resolveFeeBpsForAsset('usdc', feeSchedules, 100), 100, 'case-sensitive: usdc != USDC');
  t.end();
});

test('computeSettlementAmountsWithSchedule: uses per-asset fee schedule', (t) => {
  const feeSchedules: FeeScheduleItem[] = [
    { asset: 'USDC', bps: 50 }, // 0.5%
    { asset: 'EURT', bps: 75 }, // 0.75%
  ];

  const usdcResult = computeSettlementAmountsWithSchedule('100.000000', 'USDC', feeSchedules, 100);
  t.equal(usdcResult.feeAmount, '0.500000', 'USDC: 0.5% fee on 100 = 0.5');
  t.equal(usdcResult.netAmount, '99.500000', 'USDC: net = 100 - 0.5');

  const eurtResult = computeSettlementAmountsWithSchedule('100.000000', 'EURT', feeSchedules, 100);
  t.equal(eurtResult.feeAmount, '0.750000', 'EURT: 0.75% fee on 100 = 0.75');
  t.equal(eurtResult.netAmount, '99.250000', 'EURT: net = 100 - 0.75');

  t.end();
});

test('computeSettlementAmountsWithSchedule: falls back to default for unknown asset', (t) => {
  const feeSchedules: FeeScheduleItem[] = [
    { asset: 'USDC', bps: 50 },
  ];

  const result = computeSettlementAmountsWithSchedule('100.000000', 'XLM', feeSchedules, 100);
  t.equal(result.feeAmount, '1.000000', 'XLM: default 1% fee on 100 = 1.0');
  t.equal(result.netAmount, '99.000000', 'XLM: net = 100 - 1.0');
  t.end();
});

test('computeSettlementAmountsWithSchedule: uses default when no schedules provided', (t) => {
  const result = computeSettlementAmountsWithSchedule('100.000000', 'USDC', [], 100);
  t.equal(result.feeAmount, '1.000000', 'default 1% fee');
  t.end();
});

test('computeSettlementAmountsWithSchedule: feeSnapshot contains applied bps', (t) => {
  const feeSchedules: FeeScheduleItem[] = [
    { asset: 'USDC', bps: 50 },
  ];

  const result = computeSettlementAmountsWithSchedule('100.000000', 'USDC', feeSchedules, 100);
  t.equal(result.feeSnapshot.feeBpsApplied, 50, 'feeSnapshot has applied bps');
  t.equal(result.feeSnapshot.maxFeeBpsApplied, 50, 'maxFeeBpsApplied matches');
  t.end();
});

test('computeSettlementAmountsWithSchedule: preserves decimal precision per asset', (t) => {
  const feeSchedules: FeeScheduleItem[] = [
    { asset: 'USDC', bps: 100 }, // 1%
  ];

  // USDC has 6 decimals
  const result = computeSettlementAmountsWithSchedule('100.123456', 'USDC', feeSchedules, 100);
  t.equal(result.grossAmount, '100.123456', 'preserves input precision');
  t.equal(result.feeAmount, '1.001234', 'fee rounded down to 6 decimals');
  t.equal(result.netAmount, '99.122222', 'net = gross - fee');
  t.equal(result.feeAmount.split('.')[1]?.length, 6, 'fee has 6 decimals');
  t.end();
});

test('computeSettlementAmountsWithSchedule: three different assets with different schedules', (t) => {
  const feeSchedules: FeeScheduleItem[] = [
    { asset: 'USDC', bps: 50 },
    { asset: 'EURT', bps: 75 },
    { asset: 'XLM', bps: 25 },
  ];

  const usdc = computeSettlementAmountsWithSchedule('1000.000000', 'USDC', feeSchedules, 100);
  t.equal(usdc.feeAmount, '5.000000', 'USDC 0.5%');
  t.equal(usdc.feeSnapshot.feeBpsApplied, 50);

  const eurt = computeSettlementAmountsWithSchedule('1000.000000', 'EURT', feeSchedules, 100);
  t.equal(eurt.feeAmount, '7.500000', 'EURT 0.75%');
  t.equal(eurt.feeSnapshot.feeBpsApplied, 75);

  const xlm = computeSettlementAmountsWithSchedule('1000.000000', 'XLM', feeSchedules, 100);
  t.equal(xlm.feeAmount, '2.500000', 'XLM 0.25%');
  t.equal(xlm.feeSnapshot.feeBpsApplied, 25);

  t.end();
});