import test from 'tape';
import { buildSettlementWebhookData } from './webhook-payload.js';
import { computeSettlementAmounts } from './settlement-amounts.js';

// Issue #538 — settlement webhook payloads must carry the fee breakdown so a
// merchant can verify fee computation from the webhook alone.

function completedRow(over: Record<string, unknown> = {}) {
  const { grossAmount, feeAmount, netAmount, feeSnapshot } = computeSettlementAmounts(
    '500.0000000',
    100, // 1% base
    15_000, // monthly volume
    [{ volumeUsd: 10_000, discountBps: 10 }], // -> 10 bps discount
  );
  return {
    id: 'set_abc',
    merchantId: 'mer_1',
    status: 'completed',
    asset: 'USDC',
    grossAmount,
    feeAmount,
    netAmount,
    feeBps: 100,
    feeSnapshot,
    webhookUrl: 'https://api.merchant.example/hooks',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    completedAt: new Date('2026-01-01T00:00:05Z'),
    ...over,
  };
}

test('payload includes the full feeSnapshot and a top-level feeVersion', (t) => {
  const data = buildSettlementWebhookData(completedRow());
  t.ok(data.feeSnapshot, 'feeSnapshot is present');
  const snap = data.feeSnapshot as Record<string, unknown>;
  t.equal(typeof snap.feeBpsApplied, 'number', 'feeSnapshot.feeBpsApplied');
  t.equal(snap.discountApplied, 10, 'feeSnapshot.discountApplied reflects the volume discount');
  t.equal(snap.feeVersion, '1.0', 'feeSnapshot.feeVersion');
  t.equal(data.feeVersion, '1.0', 'top-level feeVersion mirrors the snapshot');
  t.end();
});

test('payload lets a merchant reconcile the fee: feeAmount = gross * feeBpsApplied / 10_000', (t) => {
  const data = buildSettlementWebhookData(completedRow());
  const gross = Number(data.grossAmount);
  const bps = (data.feeSnapshot as { feeBpsApplied: number }).feeBpsApplied;
  const expectedFee = (gross * bps) / 10_000;
  t.ok(Math.abs(Number(data.feeAmount) - expectedFee) < 1e-6, `feeAmount ${data.feeAmount} == ${expectedFee}`);
  t.ok(
    Math.abs(Number(data.netAmount) - (gross - Number(data.feeAmount))) < 1e-6,
    'netAmount == gross - feeAmount',
  );
  t.end();
});

test('internal columns are never leaked into the payload', (t) => {
  const data = buildSettlementWebhookData({
    ...completedRow(),
    // extra fields a raw Prisma row would carry:
    idempotencyKey: 'idem_secret',
    idempotencyKeyExpiresAt: new Date(),
    webhookHeaders: { 'X-Merchant-Auth': 'Bearer secret' },
  } as never);
  t.equal(data.idempotencyKey, undefined, 'idempotencyKey is not in the payload');
  t.equal(data.webhookHeaders, undefined, 'webhookHeaders is not in the payload');
  t.end();
});

test('feeVersion is null (not undefined) when a legacy settlement has no snapshot', (t) => {
  const data = buildSettlementWebhookData(completedRow({ feeSnapshot: null }));
  t.equal(data.feeSnapshot, null, 'feeSnapshot: null');
  t.equal(data.feeVersion, null, 'feeVersion: null');
  t.end();
});

test('settlement.failed payloads carry the same fee fields', (t) => {
  const data = buildSettlementWebhookData(completedRow({ status: 'failed', completedAt: new Date() }));
  t.equal(data.status, 'failed');
  t.ok(data.feeSnapshot, 'feeSnapshot still present on failure');
  t.equal(data.feeVersion, '1.0');
  t.end();
});
