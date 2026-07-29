import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for AES-GCM
const TAG_LENGTH = 16; // 128-bit authentication tag
const ENCRYPTED_PREFIX = '$enc$v1$';

export const SENSITIVE_FIELDS = new Set(['secretHash', 'secret', 'privateKey', 'secretKey']);

function deriveKey(secretKey?: string): Buffer {
  const key = secretKey || process.env.FIELD_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('FIELD_ENCRYPTION_KEY environment variable is missing');
  }
  if (key.length < 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must be at least 32 characters long');
  }
  return crypto.createHash('sha256').update(key).digest();
}

export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptField(plaintext: string, secretKey?: string): string {
  if (typeof plaintext !== 'string') {
    return plaintext;
  }
  if (isEncrypted(plaintext)) {
    return plaintext;
  }

  const key = deriveKey(secretKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  return `${ENCRYPTED_PREFIX}${payload}`;
}

export function decryptField(ciphertext: string, secretKey?: string): string {
  if (typeof ciphertext !== 'string' || !isEncrypted(ciphertext)) {
    return ciphertext;
  }

  const key = deriveKey(secretKey);
  const payload = ciphertext.slice(ENCRYPTED_PREFIX.length);
  const parts = payload.split(':');

  if (parts.length !== 3) {
    throw new Error('Malformed encrypted payload structure');
  }

  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error('Invalid initialization vector or auth tag length');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    throw new Error('Failed to decrypt field: authentication tag mismatch or corrupted ciphertext');
  }
}

export function encryptSensitiveFields<T>(data: T, secretKey?: string): T {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => encryptSensitiveFields(item, secretKey)) as unknown as T;
  }

  const result: Record<string, any> = { ...(data as Record<string, any>) };

  for (const key of Object.keys(result)) {
    const val = result[key];
    if (SENSITIVE_FIELDS.has(key) && typeof val === 'string') {
      result[key] = encryptField(val, secretKey);
    } else if (val && typeof val === 'object') {
      result[key] = encryptSensitiveFields(val, secretKey);
    }
  }

  return result as T;
}

export function decryptSensitiveFields<T>(data: T, secretKey?: string): T {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => decryptSensitiveFields(item, secretKey)) as unknown as T;
  }

  const result: Record<string, any> = { ...(data as Record<string, any>) };

  for (const key of Object.keys(result)) {
    const val = result[key];
    if (SENSITIVE_FIELDS.has(key) && typeof val === 'string' && isEncrypted(val)) {
      result[key] = decryptField(val, secretKey);
    } else if (val && typeof val === 'object') {
      result[key] = decryptSensitiveFields(val, secretKey);
    }
  }

  return result as T;
}
