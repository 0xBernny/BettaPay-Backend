import test from 'tape';
import { autoExpireAbandonedPayments } from './abandoned-payments-cron.js';

interface MockPrismaPayment {
  updateMany: (args: { where: any; data: any }) => Promise<{ count: number }>;
}

interface MockLogger {
  info: (obj: any, msg?: string) => void;
  error: (obj: any, msg?: string) => void;
}

function createMockPrisma(count: number): MockPrismaPayment {
  return {
    updateMany: async (args: { where: any; data: any }) => {
      lastUpdateManyArgs = args;
      return { count };
    },
  };
}

function createMockLogger(): MockLogger {
  return {
    info: () => {},
    error: () => {},
  };
}

let lastUpdateManyArgs: { where: any; data: any } | null = null;

test.beforeEach((t) => {
  lastUpdateManyArgs = null;
  t.end();
});

test('autoExpireAbandonedPayments - expires payments older than cutoff', async (t) => {
  const mockPrisma = createMockPrisma(5);
  const mockLogger = createMockLogger();
  const abandonmentHours = 24;

  const count = await autoExpireAbandonedPayments(mockPrisma as any, mockLogger as any, abandonmentHours);

  t.equal(count, 5, 'should return the count of expired payments');
  t.ok(lastUpdateManyArgs, 'updateMany should have been called');
  t.equal(lastUpdateManyArgs?.where.status, 'initiated', 'should only target initiated payments');
  t.ok(lastUpdateManyArgs?.where.createdAt.lt instanceof Date, 'createdAt filter should be a Date');
  t.equal(lastUpdateManyArgs?.data.status, 'cancelled', 'should set status to cancelled');

  const now = Date.now();
  const expectedCutoff = now - abandonmentHours * 60 * 60 * 1000;
  const actualCutoff = lastUpdateManyArgs?.where.createdAt.lt.getTime();

  // Allow a small delta for test execution time
  t.ok(Math.abs(expectedCutoff - actualCutoff) < 1000, 'cutoff time should be approximately correct');

  t.end();
});

test('autoExpireAbandonedPayments - does nothing if abandonment is disabled', async (t) => {
  const mockPrisma = createMockPrisma(0);
  const mockLogger = createMockLogger();

  const count = await autoExpireAbandonedPayments(mockPrisma as any, mockLogger as any, 0);

  t.equal(count, 0, 'should return 0');
  t.equal(lastUpdateManyArgs, null, 'updateMany should not be called');

  t.end();
});

test('autoExpireAbandonedPayments - handles zero expired payments', async (t) => {
  const mockPrisma = createMockPrisma(0);
  const mockLogger = createMockLogger();

  const count = await autoExpireAbandonedPayments(mockPrisma as any, mockLogger as any, 24);

  t.equal(count, 0, 'should return 0');
  t.ok(lastUpdateManyArgs, 'updateMany should still be called');

  t.end();
});