import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encryptField,
  decryptField,
  isEncrypted,
  encryptSensitiveFields,
  decryptSensitiveFields,
} from './encryption.js';

const TEST_KEY = 'super-secret-32-character-encryption-key-for-bettapay!';

test('encryptField & decryptField: successfully encrypts and decrypts string', () => {
  const plaintext = 'my-secret-merchant-hash-123';
  const ciphertext = encryptField(plaintext, TEST_KEY);

  assert.ok(ciphertext !== plaintext, 'Ciphertext must differ from plaintext');
  assert.ok(isEncrypted(ciphertext), 'Ciphertext must match isEncrypted format');

  const decrypted = decryptField(ciphertext, TEST_KEY);
  assert.equal(decrypted, plaintext, 'Decrypted value must equal original plaintext');
});

test('encryptField: produces unique ciphertext for identical plaintext calls due to random IV', () => {
  const plaintext = 'same-secret-value';
  const cipher1 = encryptField(plaintext, TEST_KEY);
  const cipher2 = encryptField(plaintext, TEST_KEY);

  assert.notEqual(cipher1, cipher2, 'Multiple encryptions of same value must produce different ciphertexts');
  assert.equal(decryptField(cipher1, TEST_KEY), plaintext);
  assert.equal(decryptField(cipher2, TEST_KEY), plaintext);
});

test('encryptField & decryptField: throws when FIELD_ENCRYPTION_KEY is missing or too short', () => {
  const originalEnv = process.env.FIELD_ENCRYPTION_KEY;
  delete process.env.FIELD_ENCRYPTION_KEY;

  assert.throws(() => encryptField('test'), /FIELD_ENCRYPTION_KEY environment variable is missing/);
  assert.throws(() => encryptField('test', 'short-key'), /FIELD_ENCRYPTION_KEY must be at least 32 characters long/);

  process.env.FIELD_ENCRYPTION_KEY = originalEnv;
});

test('decryptField: throws descriptive error on malformed or tampered ciphertext', () => {
  assert.throws(() => decryptField('$enc$v1$badformat', TEST_KEY), /Malformed encrypted payload structure/);

  const validCiphertext = encryptField('test', TEST_KEY);
  // Corrupt the ciphertext payload
  const tamperedCiphertext = validCiphertext.slice(0, -4) + '0000';
  assert.throws(() => decryptField(tamperedCiphertext, TEST_KEY), /Failed to decrypt field/);
});

test('encryptSensitiveFields & decryptSensitiveFields: processes sensitive fields in nested objects', () => {
  const data = {
    id: 'merchant-123',
    secretHash: 'raw-secret-hash-value',
    nested: {
      secret: 'nested-secret-value',
      name: 'Legit Merchant',
    },
  };

  const encrypted = encryptSensitiveFields(data, TEST_KEY);
  assert.notEqual(encrypted.secretHash, 'raw-secret-hash-value');
  assert.ok(isEncrypted(encrypted.secretHash));
  assert.notEqual(encrypted.nested.secret, 'nested-secret-value');
  assert.ok(isEncrypted(encrypted.nested.secret));
  assert.equal(encrypted.nested.name, 'Legit Merchant');

  const decrypted = decryptSensitiveFields(encrypted, TEST_KEY);
  assert.equal(decrypted.secretHash, 'raw-secret-hash-value');
  assert.equal(decrypted.nested.secret, 'nested-secret-value');
  assert.equal(decrypted.nested.name, 'Legit Merchant');
});
