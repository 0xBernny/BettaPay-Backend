import test from 'node:test';
import assert from 'node:assert';
import { DateRangeQuery, PaginationQuery, WebhookUrlSchema } from './schemas.js';

test('WebhookUrlSchema validation', async (t) => {
  await t.test('Valid HTTPS URL passes', () => {
    const result = WebhookUrlSchema.parse('https://example.com/hook');
    assert.strictEqual(result, 'https://example.com/hook');
  });

  await t.test('Valid HTTP URL passes in non-production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const result = WebhookUrlSchema.parse('http://example.com/hook');
      assert.strictEqual(result, 'http://example.com/hook');
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  await t.test('Non-URL string fails', () => {
    assert.throws(() => WebhookUrlSchema.parse('not-a-url'), /valid URL/);
  });

  await t.test('URL exceeding 2048 characters fails', () => {
    const long = 'https://example.com/' + 'a'.repeat(2048);
    assert.throws(() => WebhookUrlSchema.parse(long), /2048/);
  });

  await t.test('HTTP URL rejected in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      assert.throws(
        () => WebhookUrlSchema.parse('http://example.com/hook'),
        /HTTPS/
      );
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  await t.test('localhost rejected in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      assert.throws(
        () => WebhookUrlSchema.parse('https://localhost/hook'),
        /localhost|private/
      );
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  await t.test('127.0.0.1 rejected in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      assert.throws(
        () => WebhookUrlSchema.parse('https://127.0.0.1/hook'),
        /localhost|private/
      );
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  await t.test('Private IP 192.168.x.x rejected in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      assert.throws(
        () => WebhookUrlSchema.parse('https://192.168.1.1/hook'),
        /localhost|private/
      );
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  await t.test('Private IP 10.x.x.x rejected in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      assert.throws(
        () => WebhookUrlSchema.parse('https://10.0.0.1/hook'),
        /localhost|private/
      );
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  await t.test('Private IP 172.16.x.x rejected in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      assert.throws(
        () => WebhookUrlSchema.parse('https://172.16.0.1/hook'),
        /localhost|private/
      );
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  await t.test('Public IP passes in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = WebhookUrlSchema.parse('https://93.184.216.34/hook');
      assert.strictEqual(result, 'https://93.184.216.34/hook');
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  await t.test('localhost allowed in development', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const result = WebhookUrlSchema.parse('http://localhost:3000/hook');
      assert.strictEqual(result, 'http://localhost:3000/hook');
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

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
