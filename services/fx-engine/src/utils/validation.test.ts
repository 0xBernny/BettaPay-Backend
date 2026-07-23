import test from 'tape';
import { validateCurrencyPair } from './validation.js';

const SUPPORTED = ['USDC', 'EURT', 'NGN'];

test('validateCurrencyPair: returns valid for a supported pair', (t) => {
  const result = validateCurrencyPair('USDC', 'NGN', SUPPORTED);
  t.equal(result.valid, true);
  t.end();
});

test('validateCurrencyPair: returns valid for inverse supported pair', (t) => {
  const result = validateCurrencyPair('NGN', 'EURT', SUPPORTED);
  t.equal(result.valid, true);
  t.end();
});

test('validateCurrencyPair: normalizes casing', (t) => {
  const result = validateCurrencyPair('usdc', 'ngn', SUPPORTED);
  t.equal(result.valid, true);
  t.end();
});

test('validateCurrencyPair: rejects unsupported currency in from', (t) => {
  const result = validateCurrencyPair('XYZ', 'NGN', SUPPORTED);
  t.equal(result.valid, false);
  if (!result.valid) {
    t.ok(result.error.error.message.includes('XYZ'));
    t.equal(result.error.error.code, 'UNSUPPORTED_CURRENCY_PAIR');
  }
  t.end();
});

test('validateCurrencyPair: rejects unsupported currency in to', (t) => {
  const result = validateCurrencyPair('USDC', 'XYZ', SUPPORTED);
  t.equal(result.valid, false);
  if (!result.valid) {
    t.ok(result.error.error.message.includes('XYZ'));
    t.equal(result.error.error.code, 'UNSUPPORTED_CURRENCY_PAIR');
  }
  t.end();
});

test('validateCurrencyPair: rejects matching currencies', (t) => {
  const result = validateCurrencyPair('USDC', 'USDC', SUPPORTED);
  t.equal(result.valid, false);
  if (!result.valid) {
    t.ok(result.error.error.message.includes('must be different'));
    t.equal(result.error.error.code, 'INVALID_QUERY');
  }
  t.end();
});

test('validateCurrencyPair: rejects unsupported with casing normalization', (t) => {
  const result = validateCurrencyPair('btc', 'ngn', SUPPORTED);
  t.equal(result.valid, false);
  if (!result.valid) {
    t.ok(result.error.error.message.includes('BTC'));
  }
  t.end();
});

test('validateCurrencyPair: rejects both unsupported currencies', (t) => {
  const result = validateCurrencyPair('FOO', 'BAR', SUPPORTED);
  t.equal(result.valid, false);
  if (!result.valid) {
    t.ok(result.error.error.message.includes('FOO'));
    t.ok(result.error.error.message.includes('BAR'));
  }
  t.end();
});

test('validateCurrencyPair: details include supported list', (t) => {
  const result = validateCurrencyPair('XYZ', 'NGN', SUPPORTED);
  t.equal(result.valid, false);
  if (!result.valid) {
    const details = result.error.error.details as Record<string, unknown>;
    t.ok(Array.isArray(details.supportedCurrencies));
    t.deepEqual(details.supportedCurrencies, SUPPORTED);
  }
  t.end();
});