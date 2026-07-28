import test from 'node:test';
import assert from 'node:assert';
import { validateTransactionHash } from './index.js';

test('validateTransactionHash returns true for a valid 64-char lowercase hex', () => {
  const hash = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
  assert.strictEqual(hash.length, 64);
  assert.strictEqual(validateTransactionHash(hash), true);
});

test('validateTransactionHash returns false for hash with invalid length', () => {
  assert.strictEqual(validateTransactionHash('a1b2c3d4'), false);
  assert.strictEqual(validateTransactionHash(''), false);
  assert.strictEqual(validateTransactionHash('a'.repeat(63)), false);
  assert.strictEqual(validateTransactionHash('a'.repeat(65)), false);
});

test('validateTransactionHash returns false for uppercase hex', () => {
  const hash = 'A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5B6C7D8E9F0A1B';
  assert.strictEqual(validateTransactionHash(hash), false);
});

test('validateTransactionHash returns false for non-hex characters', () => {
  assert.strictEqual(validateTransactionHash('x'.repeat(64)), false);
  assert.strictEqual(validateTransactionHash('g'.repeat(64)), false);
  assert.strictEqual(validateTransactionHash('z1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b'), false);
});

test('validateTransactionHash returns false for non-string input', () => {
  assert.strictEqual(validateTransactionHash(undefined as any), false);
  assert.strictEqual(validateTransactionHash(null as any), false);
});
