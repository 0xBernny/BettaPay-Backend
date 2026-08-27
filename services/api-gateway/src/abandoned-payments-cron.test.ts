import test from 'tape';
import { autoExpireAbandonedPayments } from './abandoned-payments-cron.js';

interface MockPayment {
  id: string;
  merchantId: string;
  merchant: { settings: { webhookUrl?: string } | null } | null;
}

interface MockPrisma {
  payment: {
    findMany: (args: { where: any }) => Promise<MockPayment[]>;
    updateMany: (args: { where: any; data: any }) => Promise<{ count: number }>;
  };
}

interface MockLogger {
  info: (obj: any, msg?: string) => void;
  error: (obj: any, msg?: string) => void;
  warn: (obj: any, msg?: string) => void;
}

function createMockPrisma(payments: MockPayment[], count: number): MockPrisma {
  return {
    payment: {
      findMany: async (args: { where: any }) => {
        lastFindManyArgs = args;
        return payments;
      },
      updateMany: async (args: { where: any; data: any }) => {
        lastUpdateManyArgs = args;
        return { count };
      },
    },
  };
}

function createMockLogger(): MockLogger {
  return {
    info: () => {},
    error: () => {},
    warn: () => {},
  };
}

function stalePayment(id: string): MockPayment {
  return { id, merchantId: 'merch_1', merchant: { settings: {} } };
}

let lastFindManyArgs: { where: any } | null = null;
let lastUpdateManyArgs: { where: any; data: any } | null = null;

test('autoExpireAbandonedPayments - expires payments older than cutoff', async (t) => {
  lastFindManyArgs = null;
  lastUpdateManyArgs = null;
  const payments = [stalePayment('pay_1'), stalePayment('pay_2')];
  const mockPrisma = createMockPrisma(payments, 2);
  const mockLogger = createMockLogger();
  const abandonmentHours = 24;

  const count = await autoExpireAbandonedPayments(mockPrisma as any, mockLogger as any, abandonmentHours);

  t.equal(count, 2, 'should return the count of expired payments');
  t.ok(lastFindManyArgs, 'findMany should have been called');
  t.equal(lastFindManyArgs?.where.status, 'initiated', 'should only target initiated payments');
  t.ok(lastFindManyArgs?.where.createdAt.lt instanceof Date, 'createdAt filter should be a Date');
  t.ok(lastUpdateManyArgs, 'updateMany should have been called');
  t.deepEqual(lastUpdateManyArgs?.where.id.in, ['pay_1', 'pay_2'], 'updateMany should target the stale payment ids');
  t.equal(lastUpdateManyArgs?.data.status, 'cancelled', 'should set status to cancelled');

  const now = Date.now();
  const expectedCutoff = now - abandonmentHours * 60 * 60 * 1000;
  const actualCutoff = (lastFindManyArgs?.where.createdAt.lt as Date).getTime();

  // Allow a small delta for test execution time
  t.ok(Math.abs(expectedCutoff - actualCutoff) < 1000, 'cutoff time should be approximately correct');

  t.end();
});

test('autoExpireAbandonedPayments - does nothing if abandonment is disabled', async (t) => {
  lastFindManyArgs = null;
  lastUpdateManyArgs = null;
  const mockPrisma = createMockPrisma([], 0);
  const mockLogger = createMockLogger();

  const count = await autoExpireAbandonedPayments(mockPrisma as any, mockLogger as any, 0);

  t.equal(count, 0, 'should return 0');
  t.equal(lastFindManyArgs, null, 'findMany should not be called');
  t.equal(lastUpdateManyArgs, null, 'updateMany should not be called');

  t.end();
});

test('autoExpireAbandonedPayments - handles zero expired payments', async (t) => {
  lastFindManyArgs = null;
  lastUpdateManyArgs = null;
  const mockPrisma = createMockPrisma([], 0);
  const mockLogger = createMockLogger();

  const count = await autoExpireAbandonedPayments(mockPrisma as any, mockLogger as any, 24);

  t.equal(count, 0, 'should return 0');
  t.ok(lastFindManyArgs, 'findMany should still be called');
  t.equal(lastUpdateManyArgs, null, 'updateMany should not be called when nothing is stale');

  t.end();
});
