/**
 * encryption.ts
 *
 * Secure encryption/decryption utilities with per-encryption salt (#526).
 *
 * Design:
 * ───────
 * - Each encryption generates a fresh random salt (16 bytes)
 * - Salt is used in PBKDF2 key derivation (100,000 iterations, SHA-256)
 * - AES-256-GCM provides authenticated encryption
 * - IV (12 bytes) is randomly generated per encryption
 * - Output format: base64(salt:iv:authTag:ciphertext)
 *
 * Security properties (#526):
 * ──────────────────────────
 * - Different salts ensure identical plaintexts produce different ciphertexts
 * - No metadata leakage from deterministic encryption
 * - Authentication prevents tampering
 * - High iteration count resists brute-force attacks on weak passwords
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 16; // 128 bits
const IV_LENGTH = 12; // 96 bits (recommended for GCM)
const AUTH_TAG_LENGTH = 16; // 128 bits
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = 'sha256';

/**
 * Encrypts plaintext with a password-derived key.
 *
 * Generates a fresh salt and IV for each call, ensuring that encrypting
 * the same plaintext multiple times produces different ciphertexts (#526).
 *
 * @param plaintext  The string to encrypt
 * @param password   Password used for key derivation (min 8 characters recommended)
 * @returns          Base64-encoded string: salt:iv:authTag:ciphertext
 *
 * @example
 *   const encrypted1 = encrypt('secret data', 'myPassword');
 *   const encrypted2 = encrypt('secret data', 'myPassword');
 *   // encrypted1 !== encrypted2 (different salts produce different outputs)
 */
export function encrypt(plaintext: string, password: string): string {
  // Generate fresh salt for this encryption (#526)
  const salt = crypto.randomBytes(SALT_LENGTH);

  // Derive key from password using PBKDF2
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);

  // Generate random IV (nonce) for GCM
  const iv = crypto.randomBytes(IV_LENGTH);

  // Encrypt with AES-256-GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(plaintext, 'utf8');
  ciphertext = Buffer.concat([ciphertext, cipher.final()]);

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Combine salt, iv, authTag, and ciphertext
  const combined = Buffer.concat([salt, iv, authTag, ciphertext]);

  return combined.toString('base64');
}

/**
 * Decrypts ciphertext that was encrypted with `encrypt()`.
 *
 * Extracts the salt and IV from the encrypted payload and derives the same
 * key to decrypt the data.
 *
 * @param encrypted  Base64-encoded encrypted string from `encrypt()`
 * @param password   The same password used during encryption
 * @returns          Decrypted plaintext string
 * @throws           Error if authentication fails or password is incorrect
 *
 * @example
 *   const encrypted = encrypt('secret data', 'myPassword');
 *   const decrypted = decrypt(encrypted, 'myPassword');
 *   // decrypted === 'secret data'
 */
export function decrypt(encrypted: string, password: string): string {
  // Decode base64
  const combined = Buffer.from(encrypted, 'base64');

  // Extract components
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = combined.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH,
  );
  const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  // Derive the same key using extracted salt
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);

  // Decrypt with AES-256-GCM
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(ciphertext);
  plaintext = Buffer.concat([plaintext, decipher.final()]);

  return plaintext.toString('utf8');
}

/**
 * Verifies that a password can successfully decrypt an encrypted value
 * without returning the plaintext.
 *
 * Useful for password verification flows.
 *
 * @param encrypted  Base64-encoded encrypted string
 * @param password   Password to test
 * @returns          true if password is correct, false otherwise
 */
export function verifyPassword(encrypted: string, password: string): boolean {
  try {
    decrypt(encrypted, password);
    return true;
  } catch {
    return false;
  }
}
