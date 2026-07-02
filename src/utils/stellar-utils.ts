/**
 * Validate Stellar asset codes.
 *
 * Stellar assets have two forms:
 *   - Native asset indicated by the string "XLM" or "native".
 *   - Non‑native assets have an alphanumeric code with a length between 1 and 12
 *     characters (Stellar Alphanum4/Alphanum12). The code may contain only
 *     letters A‑Z (case‑insensitive) and digits 0‑9.
 *
 * This function returns `true` if the provided `code` satisfies the rules above
 * and `false` otherwise. It safely handles empty strings and non‑string inputs
 * by returning `false` without throwing.
 */
export function validateAssetCode(code: unknown): boolean {
  if (typeof code !== "string") {
    return false;
  }
  // Native asset shortcuts
  if (code === "XLM" || code === "native") {
    return true;
  }
  // Alphanum4/Alphanum12: 1–12 alphanumeric characters
  const regex = /^[a-zA-Z0-9]{1,12}$/;
  return regex.test(code);
}
