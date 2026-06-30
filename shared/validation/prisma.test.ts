import test from 'node:test';
import assert from 'node:assert';
import {
  buildPrismaConnectionUrl,
  connectWithRetry,
  getPrismaLogLevels,
  shouldEnablePrismaQueryLogging,
} from './prisma.js';

test('getPrismaLogLevels includes query in development', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLogLevel = process.env.LOG_LEVEL;

  process.env.NODE_ENV = 'development';
  delete process.env.LOG_LEVEL;
  assert.ok(getPrismaLogLevels().includes('query'));

  process.env.NODE_ENV = originalNodeEnv;
  process.env.LOG_LEVEL = originalLogLevel;
});

test('getPrismaLogLevels excludes query in production', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLogLevel = process.env.LOG_LEVEL;

  process.env.NODE_ENV = 'production';
  process.env.LOG_LEVEL = 'debug';
  assert.ok(!shouldEnablePrismaQueryLogging());
  assert.ok(!getPrismaLogLevels().includes('query'));

  process.env.NODE_ENV = originalNodeEnv;
  process.env.LOG_LEVEL = originalLogLevel;
});

test('connectWithRetry succeeds after transient failures', async () => {
  let attempts = 0;
  const prisma = {
    async $connect() {
      attempts += 1;
      if (attempts < 3) {
        throw new Error('connection refused');
      }
    },
  };

  const warnings: object[] = [];
  await connectWithRetry(prisma, {
    debug: () => undefined,
    warn: (obj) => warnings.push(obj),
  }, { baseDelayMs: 1, maxRetries: 5 });

  assert.strictEqual(attempts, 3);
  assert.strictEqual(warnings.length, 2);
});

test('connectWithRetry throws after exhausting retries', async () => {
  const prisma = {
    async $connect() {
      throw new Error('database unavailable');
    },
  };

  await assert.rejects(
    () =>
      connectWithRetry(prisma, {
        debug: () => undefined,
        warn: () => undefined,
      }, { baseDelayMs: 1, maxRetries: 3 }),
  );
});

test('buildPrismaConnectionUrl appends params with ? when URL has no query string', () => {
  const url = 'postgresql://user:pass@localhost:5432/bettapay';
  const result = buildPrismaConnectionUrl(url, 15, 10);
  assert.strictEqual(result, 'postgresql://user:pass@localhost:5432/bettapay?connection_limit=15&pool_timeout=10');
});

test('buildPrismaConnectionUrl appends params with & when URL already has a query string', () => {
  const url = 'postgresql://user:pass@localhost:5432/bettapay?sslmode=require';
  const result = buildPrismaConnectionUrl(url, 20, 5);
  assert.strictEqual(result, 'postgresql://user:pass@localhost:5432/bettapay?sslmode=require&connection_limit=20&pool_timeout=5');
});

test('buildPrismaConnectionUrl uses defaults when no poolSize or timeout given', () => {
  const url = 'postgresql://user:pass@localhost:5432/bettapay';
  const result = buildPrismaConnectionUrl(url);
  assert.strictEqual(result, 'postgresql://user:pass@localhost:5432/bettapay?connection_limit=10&pool_timeout=10');
});
