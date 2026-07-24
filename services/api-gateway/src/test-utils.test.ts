import test from 'tape';
import { createMockPrisma, generateTestJwt, createTestApp } from './test-utils.js';

test('mockPrisma: payment model - findUnique returns correct record', async (t) => {
  const initialPayments = [
    { id: 'pay_1', status: 'initiated', amount: '10.00', asset: 'USDC' },
    { id: 'pay_2', status: 'completed', amount: '20.00', asset: 'USDC' },
  ];
  const mockPrisma = createMockPrisma({ payments: initialPayments }) as any;

  const found = await mockPrisma.payment.findUnique({ where: { id: 'pay_1' } });
  t.ok(found, 'should find payment');
  t.equal(found.id, 'pay_1', 'should have correct id');
  t.equal(found.status, 'initiated', 'should have correct status');

  const missing = await mockPrisma.payment.findUnique({ where: { id: 'pay_missing' } });
  t.equal(missing, null, 'should return null for missing payment');

  t.end();
});

test('mockPrisma: payment model - findFirst matches criteria', async (t) => {
  const initialPayments = [
    { id: 'pay_1', status: 'initiated', idempotencyKey: 'key_1', idempotencyKeyExpiresAt: new Date(Date.now() + 60000) },
    { id: 'pay_2', status: 'completed', idempotencyKey: 'key_2', idempotencyKeyExpiresAt: new Date(Date.now() - 1000) },
  ];
  const mockPrisma = createMockPrisma({ payments: initialPayments }) as any;

  // Non-expired idempotency key lookup
  const found = await mockPrisma.payment.findFirst({
    where: {
      idempotencyKey: 'key_1',
      idempotencyKeyExpiresAt: { gt: new Date() },
    },
  });
  t.ok(found, 'should find non-expired key');
  t.equal(found.id, 'pay_1');

  // Expired key lookup should fail search criteria in findFirst
  const expired = await mockPrisma.payment.findFirst({
    where: {
      idempotencyKey: 'key_2',
      idempotencyKeyExpiresAt: { gt: new Date() },
    },
  });
  t.equal(expired, null, 'should not find expired key due to filter');

  t.end();
});

test('mockPrisma: payment model - findMany filters correctly', async (t) => {
  const initialPayments = [
    { id: 'pay_1', merchantId: 'm1', amount: '10.00' },
    { id: 'pay_2', merchantId: 'm2', amount: '20.00' },
    { id: 'pay_3', merchantId: 'm1', amount: '30.00' },
  ];
  const mockPrisma = createMockPrisma({ payments: initialPayments }) as any;

  const all = await mockPrisma.payment.findMany();
  t.equal(all.length, 3, 'should return all payments when no filter');

  const filtered = await mockPrisma.payment.findMany({ where: { merchantId: 'm1' } });
  t.equal(filtered.length, 2, 'should filter by merchantId');
  t.equal(filtered[0].id, 'pay_1');
  t.equal(filtered[1].id, 'pay_3');

  t.end();
});

test('mockPrisma: payment model - create appends and returns record', async (t) => {
  const mockPrisma = createMockPrisma() as any;

  const created = await mockPrisma.payment.create({
    data: {
      merchantId: 'm1',
      amount: '50.00',
      asset: 'EURT',
    },
  });

  t.ok(created.id, 'should auto-generate id');
  t.equal(created.merchantId, 'm1');
  t.equal(created.amount, '50.00');
  t.equal(created.status, 'initiated', 'should default status to initiated');

  const inDB = await mockPrisma.payment.findUnique({ where: { id: created.id } });
  t.ok(inDB, 'should persist created record');

  t.end();
});

test('mockPrisma: payment model - update changes existing record', async (t) => {
  const initialPayments = [{ id: 'pay_1', status: 'initiated', amount: '10.00' }];
  const mockPrisma = createMockPrisma({ payments: initialPayments }) as any;

  const updated = await mockPrisma.payment.update({
    where: { id: 'pay_1' },
    data: { status: 'completed' },
  });

  t.equal(updated.status, 'completed', 'should return updated record');
  
  const inDB = await mockPrisma.payment.findUnique({ where: { id: 'pay_1' } });
  t.equal(inDB.status, 'completed', 'should persist updates');

  t.end();
});

test('mockPrisma: merchant model - findUnique returns correct merchant', async (t) => {
  const merchants = [
    { id: 'm1', name: 'Merchant One', deletedAt: null },
    { id: 'm2', name: 'Merchant Two', deletedAt: new Date() },
  ];
  const mockPrisma = createMockPrisma({ merchants }) as any;

  const m1 = await mockPrisma.merchant.findUnique({ where: { id: 'm1' } });
  t.equal(m1.name, 'Merchant One');

  t.end();
});

test('mockPrisma: merchant model - findFirst respects soft deletion checks', async (t) => {
  const merchants = [
    { id: 'm1', name: 'Merchant One', deletedAt: null },
    { id: 'm2', name: 'Merchant Two', deletedAt: new Date() },
  ];
  const mockPrisma = createMockPrisma({ merchants }) as any;

  const active = await mockPrisma.merchant.findFirst({ where: { id: 'm1', deletedAt: null } });
  t.ok(active);

  const softDeleted = await mockPrisma.merchant.findFirst({ where: { id: 'm2', deletedAt: null } });
  t.equal(softDeleted, null, 'should filter out soft-deleted merchant');

  t.end();
});

test('mockPrisma: settlement model - create and update lifecycle', async (t) => {
  const mockPrisma = createMockPrisma() as any;

  const created = await mockPrisma.settlement.create({
    data: {
      merchantId: 'm1',
      totalAmount: '100.00',
    },
  });

  t.equal(created.status, 'PENDING');

  const updated = await mockPrisma.settlement.update({
    where: { id: created.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  t.equal(updated.status, 'COMPLETED');
  t.ok(updated.completedAt);

  t.end();
});

test('mockPrisma: auditLog model - create and query', async (t) => {
  const mockPrisma = createMockPrisma() as any;

  await mockPrisma.auditLog.create({
    data: {
      entityType: 'payment',
      action: 'payment.created',
      entityId: 'pay_1',
    },
  });

  await mockPrisma.auditLog.create({
    data: {
      entityType: 'merchant',
      action: 'merchant.updated',
      entityId: 'm1',
    },
  });

  const count = await mockPrisma.auditLog.count();
  t.equal(count, 2, 'should count all logs');

  const paymentLogs = await mockPrisma.auditLog.findMany({ where: { entityType: 'payment' } });
  t.equal(paymentLogs.length, 1);
  t.equal(paymentLogs[0].action, 'payment.created');

  t.end();
});

test('mockPrisma: $transaction executes block successfully', async (t) => {
  const mockPrisma = createMockPrisma() as any;

  const result = await mockPrisma.$transaction(async (tx: any) => {
    const payment = await tx.payment.create({
      data: { amount: '10.00', asset: 'USDC' },
    });
    return payment;
  });

  t.ok(result.id);
  t.equal(result.amount, '10.00');

  t.end();
});

test('test-utils: createTestApp setup app instance with default mockPrisma', async (t) => {
  const { app, mockPrisma } = createTestApp();
  t.ok(app, 'app should be defined');
  t.ok(mockPrisma, 'mockPrisma should be defined');
  await app.close();
  t.end();
});

test('test-utils: generateTestJwt returns valid signed token', async (t) => {
  const { app } = createTestApp();
  const token = generateTestJwt(app, { merchantId: 'm100', ownerId: 'owner100' });
  t.ok(token, 'should return a token');

  const decoded = app.jwt.decode(token) as any;
  t.equal(decoded.merchantId, 'm100');
  t.equal(decoded.ownerId, 'owner100');

  await app.close();
  t.end();
});
