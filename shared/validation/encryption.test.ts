/**
 * encryption.test.ts
 *
 * Tests for encryption.ts focusing on per-encryption salt uniqueness (#526).
 */

import test from 'tape';
import { encrypt, decrypt, verifyPassword } from './encryption.js';

test('encrypt: produces different ciphertexts for identical plaintexts (#526)', (t) => {
  const plaintext = 'sensitive data';
  const password = 'test-password-123';

  const encrypted1 = encrypt(plaintext, password);
  const encrypted2 = encrypt(plaintext, password);
  const encrypted3 = encrypt(plaintext, password);

  t.notEqual(encrypted1, encrypted2, 'first and second encryptions should differ');
  t.notEqual(encrypted2, encrypted3, 'second and third encryptions should differ');
  t.notEqual(encrypted1, encrypted3, 'first and third encryptions should differ');

  // All should decrypt to the same plaintext
  t.equal(decrypt(encrypted1, password), plaintext, 'first decrypts correctly');
  t.equal(decrypt(encrypted2, password), plaintext, 'second decrypts correctly');
  t.equal(decrypt(encrypted3, password), plaintext, 'third decrypts correctly');

  t.end();
});

test('encrypt/decrypt: round-trip preserves plaintext', (t) => {
  const plaintext = 'Hello, World! 🌍';
  const password = 'secure-password';

  const encrypted = encrypt(plaintext, password);
  const decrypted = decrypt(encrypted, password);

  t.equal(decrypted, plaintext, 'decrypted plaintext matches original');
  t.end();
});

test('decrypt: throws on wrong password', (t) => {
  const plaintext = 'secret message';
  const correctPassword = 'correct-password';
  const wrongPassword = 'wrong-password';

  const encrypted = encrypt(plaintext, correctPassword);

  t.throws(
    () => decrypt(encrypted, wrongPassword),
    /bad decrypt|Unsupported state or unable to authenticate/,
    'should throw on incorrect password',
  );

  t.end();
});

test('decrypt: throws on tampered ciphertext', (t) => {
  const plaintext = 'important data';
  const password = 'my-password';

  const encrypted = encrypt(plaintext, password);
  
  // Tamper with the base64 string (change a character)
  const tampered = encrypted.slice(0, -1) + (encrypted.slice(-1) === 'A' ? 'B' : 'A');

  t.throws(
    () => decrypt(tampered, password),
    /bad decrypt|Unsupported state or unable to authenticate/,
    'should throw on tampered ciphertext',
  );

  t.end();
});

test('encrypt: handles empty string', (t) => {
  const plaintext = '';
  const password = 'password';

  const encrypted = encrypt(plaintext, password);
  const decrypted = decrypt(encrypted, password);

  t.equal(decrypted, plaintext, 'empty string round-trip works');
  t.end();
});

test('encrypt: handles special characters and unicode', (t) => {
  const plaintext = '€£¥ 中文 🔐 \n\t\r';
  const password = 'test';

  const encrypted = encrypt(plaintext, password);
  const decrypted = decrypt(encrypted, password);

  t.equal(decrypted, plaintext, 'special characters preserved');
  t.end();
});

test('encrypt: produces different output for different passwords', (t) => {
  const plaintext = 'same data';
  const password1 = 'password1';
  const password2 = 'password2';

  const encrypted1 = encrypt(plaintext, password1);
  const encrypted2 = encrypt(plaintext, password2);

  t.notEqual(encrypted1, encrypted2, 'different passwords produce different ciphertexts');

  t.equal(decrypt(encrypted1, password1), plaintext, 'password1 decrypts its own encryption');
  t.equal(decrypt(encrypted2, password2), plaintext, 'password2 decrypts its own encryption');

  t.throws(
    () => decrypt(encrypted1, password2),
    'password2 cannot decrypt password1\'s ciphertext',
  );

  t.end();
});

test('encrypt: salt uniqueness under rapid successive calls', (t) => {
  const plaintext = 'test';
  const password = 'pwd';
  const count = 100;

  const ciphertexts = new Set<string>();
  for (let i = 0; i < count; i++) {
    const encrypted = encrypt(plaintext, password);
    ciphertexts.add(encrypted);
  }

  t.equal(ciphertexts.size, count, `all ${count} encryptions should be unique due to fresh salts`);
  t.end();
});

test('verifyPassword: returns true for correct password', (t) => {
  const plaintext = 'data';
  const password = 'correct';

  const encrypted = encrypt(plaintext, password);
  
  t.ok(verifyPassword(encrypted, password), 'correct password should verify');
  t.end();
});

test('verifyPassword: returns false for incorrect password', (t) => {
  const plaintext = 'data';
  const correctPassword = 'correct';
  const wrongPassword = 'wrong';

  const encrypted = encrypt(plaintext, correctPassword);
  
  t.notOk(verifyPassword(encrypted, wrongPassword), 'wrong password should not verify');
  t.end();
});

test('verifyPassword: returns false for tampered ciphertext', (t) => {
  const plaintext = 'data';
  const password = 'password';

  const encrypted = encrypt(plaintext, password);
  const tampered = encrypted.slice(0, -1) + 'X';
  
  t.notOk(verifyPassword(tampered, password), 'tampered ciphertext should not verify');
  t.end();
});

test('encrypt: long plaintext encryption and decryption', (t) => {
  const plaintext = 'A'.repeat(10000); // 10KB of data
  const password = 'secure-password';

  const encrypted = encrypt(plaintext, password);
  const decrypted = decrypt(encrypted, password);

  t.equal(decrypted, plaintext, 'long plaintext preserved');
  t.ok(encrypted.length > plaintext.length, 'encrypted data includes overhead (salt, IV, tag)');
  t.end();
});

test('encrypt: metadata format validation', (t) => {
  const plaintext = 'test data';
  const password = 'password';

  const encrypted = encrypt(plaintext, password);
  const decoded = Buffer.from(encrypted, 'base64');

  // Format: salt (16 bytes) + iv (12 bytes) + authTag (16 bytes) + ciphertext
  const minLength = 16 + 12 + 16; // Minimum for empty plaintext
  t.ok(decoded.length >= minLength, 'encrypted output contains salt, IV, and auth tag');

  // Verify structure by decrypting (would fail if format is wrong)
  t.doesNotThrow(() => decrypt(encrypted, password), 'format is valid and parseable');

  t.end();
});

test('decrypt: handles invalid base64', (t) => {
  const password = 'password';
  const invalidBase64 = 'not-valid-base64!!!';

  t.throws(
    () => decrypt(invalidBase64, password),
    'invalid base64 should throw',
  );

  t.end();
});

test('decrypt: handles truncated encrypted data', (t) => {
  const plaintext = 'data';
  const password = 'password';

  const encrypted = encrypt(plaintext, password);
  // Truncate to less than minimum required length
  const truncated = encrypted.slice(0, 20);

  t.throws(
    () => decrypt(truncated, password),
    'truncated data should throw',
  );

  t.end();
});
