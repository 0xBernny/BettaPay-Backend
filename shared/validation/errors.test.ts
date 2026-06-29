import test from 'node:test';
import assert from 'node:assert';
import { createErrorResponse, ErrorCodes } from './errors.js';

test('createErrorResponse builds the standard envelope', () => {
  const res = createErrorResponse(ErrorCodes.NOT_FOUND, 'Resource not found');
  assert.deepStrictEqual(res, { error: { code: 'NOT_FOUND', message: 'Resource not found' } });
  assert.strictEqual('details' in res.error, false);
});

test('createErrorResponse includes details when provided', () => {
  const details = [{ field: 'id', message: 'Invalid format' }];
  const res = createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', details);
  assert.strictEqual(res.error.code, 'VALIDATION_ERROR');
  assert.deepStrictEqual(res.error.details, details);
});
