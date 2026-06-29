import test from 'node:test';
import assert from 'node:assert';
import { DateRangeQuery, IdempotencyKeySchema, PaginationQuery, CreatePaymentBody, CreateSettlementBody } from './schemas.js';

test('PaginationQuery validation', async (t) => {
  await t.test('Default limit is 50', () => {
    const result = PaginationQuery.parse({});
    assert.strictEqual(result.limit, 50);
  });

  await t.test('Default offset is 0', () => {
    const result = PaginationQuery.parse({});
    assert.strictEqual(result.offset, 0);
  });

  await t.test('Custom limit works', () => {
    const result = PaginationQuery.parse({ limit: 100 });
    assert.strictEqual(result.limit, 100);
  });

  await t.test('Custom offset works', () => {
    const result = PaginationQuery.parse({ offset: 10 });
    assert.strictEqual(result.offset, 10);
  });

  await t.test('Limit above 200 fails', () => {
    assert.throws(() => PaginationQuery.parse({ limit: 201 }), /Number must be less than or equal to 200/);
  });

  await t.test('Negative offset fails', () => {
    assert.throws(() => PaginationQuery.parse({ offset: -1 }), /Number must be greater than or equal to 0/);
  });

  await t.test('Additional query parameters are accepted with passthrough', () => {
    const PassthroughQuery = PaginationQuery.passthrough();
    const result = PassthroughQuery.parse({ limit: 10, offset: 5, sort: 'desc', filter: 'active' }) as any;
    assert.strictEqual(result.limit, 10);
    assert.strictEqual(result.offset, 5);
    assert.strictEqual(result.sort, 'desc');
    assert.strictEqual(result.filter, 'active');
  });
  
  await t.test('Coerces string values to numbers', () => {
    const result = PaginationQuery.parse({ limit: '25', offset: '5' });
    assert.strictEqual(result.limit, 25);
    assert.strictEqual(result.offset, 5);
  });
});

test('DateRangeQuery validation', async (t) => {
  await t.test('Valid ISO from date passes', () => {
    const from = new Date('2023-01-01').toISOString();
    const result = DateRangeQuery.parse({ from });
    assert.strictEqual(result.from, from);
    assert.ok(result.to); // Default applies
  });

  await t.test('Valid ISO to date passes', () => {
    const to = new Date('2023-12-31').toISOString();
    const result = DateRangeQuery.parse({ to });
    assert.strictEqual(result.to, to);
    assert.strictEqual(result.from, undefined);
  });

  await t.test('Invalid date strings fail', () => {
    assert.throws(() => DateRangeQuery.parse({ from: 'not-a-date' }), /Invalid ISO date string/);
    assert.throws(() => DateRangeQuery.parse({ to: 'also-not-a-date' }), /Invalid ISO date string/);
  });

  await t.test('from earlier than to passes', () => {
    const from = new Date('2023-01-01').toISOString();
    const to = new Date('2023-12-31').toISOString();
    const result = DateRangeQuery.parse({ from, to });
    assert.strictEqual(result.from, from);
    assert.strictEqual(result.to, to);
  });

  await t.test('from after to fails', () => {
    const from = new Date('2023-12-31').toISOString();
    const to = new Date('2023-01-01').toISOString();
    assert.throws(() => DateRangeQuery.parse({ from, to }), /from must be before to/);
  });

  await t.test('Missing to defaults to current time', () => {
    const before = new Date();
    const result = DateRangeQuery.parse({});
    const after = new Date();
    const toDate = new Date(result.to!);
    
    assert.ok(toDate >= before && toDate <= after);
    assert.strictEqual(result.from, undefined);
  });

  await t.test('Missing fields are handled correctly', () => {
    const result = DateRangeQuery.parse({});
    assert.strictEqual(result.from, undefined);
    assert.ok(result.to); // Default applies
  });
});

test('IdempotencyKeySchema validation', async (t) => {
  await t.test('Valid UUID v4 passes', () => {
    const key = '550e8400-e29b-41d4-a716-446655440000';
    const result = IdempotencyKeySchema.parse(key);
    assert.strictEqual(result, key);
  });

  await t.test('Non-UUID string fails', () => {
    assert.throws(
      () => IdempotencyKeySchema.parse('not-a-uuid'),
      /idempotencyKey must be a valid UUID/
    );
  });

  await t.test('Empty string fails', () => {
    assert.throws(
      () => IdempotencyKeySchema.parse(''),
      /idempotencyKey must be a valid UUID/
    );
  });

  await t.test('UUID with wrong format fails', () => {
    assert.throws(
      () => IdempotencyKeySchema.parse('550e8400-e29b-41d4-a716'),
      /idempotencyKey must be a valid UUID/
    );
  });

  await t.test('CreatePaymentBody accepts optional idempotencyKey', () => {
    const key = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const result = CreatePaymentBody.parse({
      merchantId: 'merchant-1',
      amount: '100.00',
      asset: 'USDC',
      idempotencyKey: key,
    });
    assert.strictEqual(result.idempotencyKey, key);
  });

  await t.test('CreatePaymentBody works without idempotencyKey', () => {
    const result = CreatePaymentBody.parse({
      merchantId: 'merchant-1',
      amount: '100.00',
      asset: 'USDC',
    });
    assert.strictEqual(result.idempotencyKey, undefined);
  });

  await t.test('CreatePaymentBody rejects invalid idempotencyKey', () => {
    assert.throws(
      () => CreatePaymentBody.parse({
        merchantId: 'merchant-1',
        amount: '100.00',
        asset: 'USDC',
        idempotencyKey: 'not-a-uuid',
      }),
      /idempotencyKey must be a valid UUID/
    );
  });

  await t.test('CreateSettlementBody accepts optional idempotencyKey', () => {
    const key = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const result = CreateSettlementBody.parse({
      merchantId: 'merchant-1',
      amount: '500.00',
      asset: 'USDC',
      idempotencyKey: key,
    });
    assert.strictEqual(result.idempotencyKey, key);
  });

  await t.test('CreateSettlementBody works without idempotencyKey', () => {
    const result = CreateSettlementBody.parse({
      merchantId: 'merchant-1',
      amount: '500.00',
      asset: 'USDC',
    });
    assert.strictEqual(result.idempotencyKey, undefined);
  });

  await t.test('CreateSettlementBody rejects invalid idempotencyKey', () => {
    assert.throws(
      () => CreateSettlementBody.parse({
        merchantId: 'merchant-1',
        amount: '500.00',
        asset: 'USDC',
        idempotencyKey: 'bad-key',
      }),
      /idempotencyKey must be a valid UUID/
    );
  });
});
