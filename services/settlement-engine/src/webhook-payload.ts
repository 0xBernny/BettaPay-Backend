import type { FeeAuditSnapshot } from './settlement-amounts.js';

/** The subset of a Settlement row that the webhook payload is built from. */
export interface SettlementWebhookSource {
  id: string;
  merchantId: string;
  status: string;
  asset: string;
  grossAmount: string;
  feeAmount: string;
  netAmount: string;
  feeBps: number;
  feeSnapshot: unknown;
  webhookUrl: string | null;
  createdAt?: Date | string | null;
  completedAt?: Date | string | null;
}

/**
 * Projects a Settlement row into the `settlement.completed` /
 * `settlement.failed` webhook payload `data` (issue #538).
 *
 * An explicit projection rather than the raw Prisma row: internal columns
 * (`idempotencyKey*`, `webhookHeaders`, …) are never sent, and the fee audit
 * trail is *guaranteed* present so a merchant can verify fee computation from
 * the webhook alone — the full `feeSnapshot` breakdown plus a top-level
 * `feeVersion` for quick reconciliation. Fields are documented in
 * `docs/INDEXER_AND_WEBHOOKS.md`.
 */
export function buildSettlementWebhookData(
  s: SettlementWebhookSource,
): Record<string, unknown> {
  const feeSnapshot = (s.feeSnapshot ?? null) as FeeAuditSnapshot | null;
  return {
    id: s.id,
    merchantId: s.merchantId,
    status: s.status,
    asset: s.asset,
    grossAmount: s.grossAmount,
    feeAmount: s.feeAmount,
    netAmount: s.netAmount,
    feeBps: s.feeBps,
    feeSnapshot,
    feeVersion: feeSnapshot?.feeVersion ?? null,
    webhookUrl: s.webhookUrl,
    createdAt: s.createdAt ?? null,
    completedAt: s.completedAt ?? null,
  };
}
