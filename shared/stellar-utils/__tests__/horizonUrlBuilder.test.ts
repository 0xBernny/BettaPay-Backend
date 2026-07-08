import test from 'node:test';
import assert from 'node:assert';
import { buildHorizonUrl } from '../index.js';

test('buildHorizonUrl', async (t) => {
  const BASE_URL = 'https://horizon.stellar.org';

  await t.test('constructs URL without trailing slash', () => {
    const result = buildHorizonUrl('https://horizon.stellar.org', 'accounts');
    assert.strictEqual(result, 'https://horizon.stellar.org/accounts');
  });

  await t.test('constructs URL with trailing slash in base URL', () => {
    const result = buildHorizonUrl('https://horizon.stellar.org/', 'accounts');
    assert.strictEqual(result, 'https://horizon.stellar.org/accounts');
  });

  await t.test('constructs URL with query parameters', () => {
    const result = buildHorizonUrl(BASE_URL, 'transactions', { limit: 10, order: 'desc' });
    assert.strictEqual(result, 'https://horizon.stellar.org/transactions?limit=10&order=desc');
  });

  await t.test('encodes spaces in query parameters', () => {
    const result = buildHorizonUrl(BASE_URL, 'accounts', { signer: 'GABC =DEF' });
    assert.strictEqual(result, 'https://horizon.stellar.org/accounts?signer=GABC+%3DDEF');
  });

  await t.test('encodes special characters in query parameters', () => {
    const result = buildHorizonUrl(BASE_URL, 'payments', { asset: 'USD:GABC&XYZ' });
    assert.strictEqual(result, 'https://horizon.stellar.org/payments?asset=USD%3AGABC%26XYZ');
  });

  await t.test('handles array values as comma-separated strings', () => {
    const result = buildHorizonUrl(BASE_URL, 'transactions', { join: 'transactions' });
    assert.strictEqual(result, 'https://horizon.stellar.org/transactions?join=transactions');
  });

  await t.test('returns clean URL without trailing ? when params is undefined', () => {
    const result = buildHorizonUrl(BASE_URL, 'operations');
    assert.strictEqual(result, 'https://horizon.stellar.org/operations');
    assert.ok(!result.includes('?'));
  });

  await t.test('returns clean URL without trailing ? when params is empty', () => {
    const result = buildHorizonUrl(BASE_URL, 'payments', {});
    assert.strictEqual(result, 'https://horizon.stellar.org/payments');
    assert.ok(!result.includes('?'));
  });

  await t.test('supports accounts resource', () => {
    const result = buildHorizonUrl(BASE_URL, 'accounts');
    assert.strictEqual(result, 'https://horizon.stellar.org/accounts');
  });

  await t.test('supports transactions resource', () => {
    const result = buildHorizonUrl(BASE_URL, 'transactions');
    assert.strictEqual(result, 'https://horizon.stellar.org/transactions');
  });

  await t.test('supports operations resource', () => {
    const result = buildHorizonUrl(BASE_URL, 'operations');
    assert.strictEqual(result, 'https://horizon.stellar.org/operations');
  });

  await t.test('supports payments resource', () => {
    const result = buildHorizonUrl(BASE_URL, 'payments');
    assert.strictEqual(result, 'https://horizon.stellar.org/payments');
  });

  await t.test('supports effects resource', () => {
    const result = buildHorizonUrl(BASE_URL, 'effects');
    assert.strictEqual(result, 'https://horizon.stellar.org/effects');
  });

  await t.test('handles multiple query parameters with special characters', () => {
    const result = buildHorizonUrl('https://horizon.stellar.org/', 'accounts', {
      signer: 'GABC DEF',
      limit: 5,
    });
    const url = new URL(result);
    assert.strictEqual(url.searchParams.get('signer'), 'GABC DEF');
    assert.strictEqual(url.searchParams.get('limit'), '5');
  });

  await t.test('filters out null and undefined parameter values', () => {
    const result = buildHorizonUrl(BASE_URL, 'accounts', {
      signer: 'GB',
      limit: undefined,
      cursor: null,
    });
    assert.strictEqual(result, 'https://horizon.stellar.org/accounts?signer=GB');
  });
});