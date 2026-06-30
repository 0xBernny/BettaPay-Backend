import { describe, it, expect } from 'vitest'; 
import { toStellarAmount, fromStellarAmount, formatAmount } from '../conversion';

describe('Stellar Stroop Conversion Utilities', () => {

  // 1. Test toStellarAmount (Converts standard alphanumeric input to Stroops e.g., '1.5' -> '15000000')
  describe('toStellarAmount', () => {
    it('should convert standard base decimal values to exact 7-decimal stroops string', () => {
      expect(toStellarAmount('1.5')).toBe('15000000');
      expect(toStellarAmount('0.0000001')).toBe('1');
    });

    it('should handle zero gracefully', () => {
      expect(toStellarAmount('0')).toBe('0');
      expect(toStellarAmount('0.00')).toBe('0');
    });

    it('should handle base values with empty or omitted fractional parts', () => {
      expect(toStellarAmount('10')).toBe('10000000');
      expect(toStellarAmount('10.')).toBe('10000000');
    });

    it('should operate correctly up to safe integer boundaries', () => {
      // Max safe integer context limits checking
      expect(toStellarAmount('90071992.5474099')).toBe('900719925474099');
    });

    it('should throw an error or handle invalid non-numeric inputs gracefully', () => {
      expect(() => toStellarAmount('invalid-numeric')).toThrow();
      expect(() => toStellarAmount('')).toThrow();
    });
  });

  // 2. Test fromStellarAmount (Converts 7-decimal Stroops string back to standard units e.g., '15000000' -> '1.5')
  describe('fromStellarAmount', () => {
    it('should convert standard stroops strings into a clean standard numeric string representation', () => {
      expect(fromStellarAmount('15000000')).toBe('1.5');
      expect(fromStellarAmount('1')).toBe('0.0000001');
    });

    it('should strip excessive trailing zeros safely after the decimal point', () => {
      expect(fromStellarAmount('100000000')).toBe('10');
      expect(fromStellarAmount('50500000')).toBe('5.05');
    });

    it('should handle zero stroops amount input string', () => {
      expect(fromStellarAmount('0')).toBe('0');
    });

    it('should handle very large token volume stroop metrics', () => {
      expect(fromStellarAmount('1000000000000000')).toBe('100000000');
    });
  });

  // 3. Test formatAmount (Handles localized display parsing/formatting with graceful degradation)
  describe('formatAmount', () => {
    it('should return structural human-readable notation strings on valid amounts', () => {
      // Assuming formatAmount formats stroops into standard formatted display
      expect(formatAmount('15000000')).toContain('1.5');
    });

    it('should gracefully degrade instead of crashing on invalid input types', () => {
      const fallbackResult = formatAmount('abc-corrupted-payload');
      expect(fallbackResult).toBe('0.00'); // Standard safe financial fallback notation
    });
  });

  // 4. Test Invariant Round-Trip Conversion properties
  describe('Round-Trip Mathematical Invariant Inversion', () => {
    it('fromStellarAmount(toStellarAmount(x)) should accurately resolve back to x for valid structures', () => {
      const inputValues = ['1.5', '0.05', '1250', '0.0000001', '99999.99'];
      
      for (const value of inputValues) {
        const stroops = toStellarAmount(value);
        const roundTripResult = fromStellarAmount(stroops);
        expect(roundTripResult).toBe(value);
      }
    });
  });
});