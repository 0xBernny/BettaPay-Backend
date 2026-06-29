import test from 'tape';
import { FeeRule } from '@bettapay/validation';

// Mirrors the resolution logic in fetchMerchantFeeBps (src/index.ts), without a
// database: given a merchant record, pick settings.feeBps or fall back to default.
function resolveFeeBps(merchant: { settings?: unknown } | null, defaultBps: number): number {
  const parsed = FeeRule.passthrough().safeParse(merchant?.settings);
  return parsed.success ? parsed.data.feeBps : defaultBps;
}

test('a configured feeBps is used', (t) => {
  t.equal(resolveFeeBps({ settings: { feeBps: 75 } }, 100), 75, 'returns the merchant rule');
  t.end();
});

test('a missing merchant falls back to the default', (t) => {
  t.equal(resolveFeeBps(null, 100), 100, 'returns default when no merchant');
  t.end();
});

test('no fee rule falls back to the default', (t) => {
  t.equal(resolveFeeBps({ settings: null }, 100), 100, 'null settings -> default');
  t.equal(resolveFeeBps({ settings: { tier: 'gold' } }, 100), 100, 'settings without feeBps -> default');
  t.end();
});

test('a malformed feeBps falls back to the default', (t) => {
  t.equal(resolveFeeBps({ settings: { feeBps: '75' as unknown as number } }, 100), 100, 'non-number -> default');
  t.end();
});
