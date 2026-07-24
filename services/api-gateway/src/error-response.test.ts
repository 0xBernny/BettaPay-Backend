import test from 'tape';
import { createErrorResponse, ErrorCodes } from '@bettapay/validation';
import { buildApp } from './index.js';
import { createMockPrisma } from './test-utils.js';

test('createErrorResponse builds the standard envelope', (t) => {
  const res = createErrorResponse(ErrorCodes.NOT_FOUND, 'Merchant not found');
  t.deepEqual(res, { error: { code: 'NOT_FOUND', message: 'Merchant not found' } }, 'shape is { error: { code, message } }');
  t.notOk('details' in res.error, 'details is omitted when not provided');
  t.end();
});

test('createErrorResponse includes details when provided', (t) => {
  const res = createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', [{ path: ['amount'] }]);
  t.equal(res.error.code, 'VALIDATION_ERROR', 'code is set');
  t.ok(Array.isArray(res.error.details), 'details is carried through');
  t.end();
});

test('a Zod failure on gateway route returns a 400 VALIDATION_ERROR with the issue list in details', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });

  // Test Zod error handler on real POST /api/payments route (missing token doesn't bypass validation, or we can use any route without auth, e.g. /api/auth/wallet/verify)
  // Let's use /api/auth/wallet/verify which requires address, challenge, signature
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/wallet/verify',
    payload: { address: 'invalid-address' } // Missing challenge and signature
  });

  t.equal(res.statusCode, 400, 'status is preserved at 400');
  const body = JSON.parse(res.body);
  t.equal(body.error.code, 'VALIDATION_ERROR', 'code is VALIDATION_ERROR');
  t.ok(Array.isArray(body.error.details) && body.error.details.length > 0, 'details holds the Zod error list');

  await app.close();
  t.end();
});
