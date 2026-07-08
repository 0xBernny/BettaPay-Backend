import { validateAssetCode } from '../stellar-utils';

describe('validateAssetCode', () => {
  // Native asset shortcuts
  test('accepts native asset identifiers', () => {
    expect(validateAssetCode('XLM')).toBe(true);
    expect(validateAssetCode('native')).toBe(true);
  });

  // Valid alphanumeric codes
  test('accepts valid alphanum asset codes', () => {
    const valid = ['USD', 'USDC', 'A', 'B12345678901', 'Z9']; // up to 12 chars
    valid.forEach((code) => expect(validateAssetCode(code)).toBe(true));
  });

  // Edge case: exactly 12 characters
  test('accepts code with exactly 12 characters', () => {
    const code = 'ABCDEFGHIJKL'; // 12 letters
    expect(validateAssetCode(code)).toBe(true);
  });

  // Invalid special characters
  test('rejects codes with invalid characters', () => {
    const invalid = ['US_DC', 'USD$', 'US D', 'US-DC', 'US.DC'];
    invalid.forEach((code) => expect(validateAssetCode(code)).toBe(false));
  });

  // Length violations
  test('rejects codes longer than 12 characters', () => {
    const tooLong = ['ABCDEFGHIJKLM', '1234567890123'];
    tooLong.forEach((code) => expect(validateAssetCode(code)).toBe(false));
  });

  // Type guarding
  test('returns false for empty string or non‑string inputs', () => {
    expect(validateAssetCode('')).toBe(false);
    // @ts-expect-error testing runtime behavior with wrong type
    expect(validateAssetCode(undefined as any)).toBe(false);
    // @ts-expect-error
    expect(validateAssetCode(null as any)).toBe(false);
    // @ts-expect-error
    expect(validateAssetCode(123 as any)).toBe(false);
  });
});
