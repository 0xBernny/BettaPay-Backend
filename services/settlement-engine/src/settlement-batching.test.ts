import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Settlement Batching', () => {
  beforeEach(async () => {
    // Clean up test data
    await prisma.settlement.deleteMany({});
    await prisma.settlementBatch.deleteMany({});
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.settlement.deleteMany({});
    await prisma.settlementBatch.deleteMany({});
  });

  it('should batch 2 USDC settlements and leave 1 EURT pending when BATCH_MIN_COUNT=2', async () => {
    // Create 3 pending settlements: 2 USDC, 1 EURT
    const settlements = await Promise.all([
      prisma.settlement.create({
        data: {
          id: 'test-settlement-1',
          merchantId: 'merchant-1',
          totalAmount: '100',
          grossAmount: '100',
          feeAmount: '1',
          netAmount: '99',
          feeBps: 100,
          asset: 'USDC',
          status: 'pending',
        },
      }),
      prisma.settlement.create({
        data: {
          id: 'test-settlement-2',
          merchantId: 'merchant-2',
          totalAmount: '200',
          grossAmount: '200',
          feeAmount: '2',
          netAmount: '198',
          feeBps: 100,
          asset: 'USDC',
          status: 'pending',
        },
      }),
      prisma.settlement.create({
        data: {
          id: 'test-settlement-3',
          merchantId: 'merchant-3',
          totalAmount: '150',
          grossAmount: '150',
          feeAmount: '1.5',
          netAmount: '148.5',
          feeBps: 100,
          asset: 'EURT',
          status: 'pending',
        },
      }),
    ]);

    // Simulate batching logic
    const BATCH_MIN_COUNT = 2;
    const pendingSettlements = await prisma.settlement.findMany({
      where: { status: 'pending' },
    });

    // Group by asset
    const grouped = pendingSettlements.reduce((acc, s) => {
      if (!acc[s.asset]) acc[s.asset] = [];
      acc[s.asset].push(s);
      return acc;
    }, {} as Record<string, typeof pendingSettlements>);

    // Create batches for assets with >= BATCH_MIN_COUNT
    for (const [asset, settlements] of Object.entries(grouped)) {
      if (settlements.length >= BATCH_MIN_COUNT) {
        const totalGross = settlements.reduce((sum, s) => sum + parseFloat(s.grossAmount), 0).toString();
        const totalFees = settlements.reduce((sum, s) => sum + parseFloat(s.feeAmount), 0).toString();
        const totalNet = settlements.reduce((sum, s) => sum + parseFloat(s.netAmount), 0).toString();

        const batch = await prisma.settlementBatch.create({
          data: {
            asset,
            totalCount: settlements.length,
            totalGross,
            totalFees,
            totalNet,
          },
        });

        // Update settlements with batchId and mark completed
        await prisma.settlement.updateMany({
          where: { id: { in: settlements.map((s) => s.id) } },
          data: { batchId: batch.id, status: 'completed' },
        });
      }
    }

    // Verify USDC batch was created
    const usdcBatch = await prisma.settlementBatch.findFirst({
      where: { asset: 'USDC' },
    });
    expect(usdcBatch).toBeDefined();
    expect(usdcBatch?.totalCount).toBe(2);
    expect(usdcBatch?.totalGross).toBe('300');

    // Verify USDC settlements are completed with batchId
    const usdcSettlements = await prisma.settlement.findMany({
      where: { asset: 'USDC' },
    });
    expect(usdcSettlements).toHaveLength(2);
    expect(usdcSettlements.every((s) => s.status === 'completed')).toBe(true);
    expect(usdcSettlements.every((s) => s.batchId === usdcBatch?.id)).toBe(true);

    // Verify EURT settlement is still pending (no batch)
    const eurtSettlement = await prisma.settlement.findFirst({
      where: { asset: 'EURT' },
    });
    expect(eurtSettlement?.status).toBe('pending');
    expect(eurtSettlement?.batchId).toBeNull();

    // Verify no EURT batch was created
    const eurtBatch = await prisma.settlementBatch.findFirst({
      where: { asset: 'EURT' },
    });
    expect(eurtBatch).toBeNull();
  });

  it('should not create batch when only 1 settlement is pending', async () => {
    await prisma.settlement.create({
      data: {
        id: 'test-settlement-solo',
        merchantId: 'merchant-1',
        totalAmount: '100',
        grossAmount: '100',
        feeAmount: '1',
        netAmount: '99',
        feeBps: 100,
        asset: 'USDC',
        status: 'pending',
      },
    });

    // Simulate batching logic
    const BATCH_MIN_COUNT = 2;
    const pendingSettlements = await prisma.settlement.findMany({
      where: { status: 'pending' },
    });

    const grouped = pendingSettlements.reduce((acc, s) => {
      if (!acc[s.asset]) acc[s.asset] = [];
      acc[s.asset].push(s);
      return acc;
    }, {} as Record<string, typeof pendingSettlements>);

    for (const [asset, settlements] of Object.entries(grouped)) {
      if (settlements.length >= BATCH_MIN_COUNT) {
        await prisma.settlementBatch.create({
          data: {
            asset,
            totalCount: settlements.length,
            totalGross: settlements.reduce((sum, s) => sum + parseFloat(s.grossAmount), 0).toString(),
            totalFees: settlements.reduce((sum, s) => sum + parseFloat(s.feeAmount), 0).toString(),
            totalNet: settlements.reduce((sum, s) => sum + parseFloat(s.netAmount), 0).toString(),
          },
        });
      }
    }

    const batches = await prisma.settlementBatch.findMany();
    expect(batches).toHaveLength(0);

    const settlement = await prisma.settlement.findFirst();
    expect(settlement?.status).toBe('pending');
    expect(settlement?.batchId).toBeNull();
  });

  it('should not create batches when 0 settlements are pending', async () => {
    const BATCH_MIN_COUNT = 2;
    const pendingSettlements = await prisma.settlement.findMany({
      where: { status: 'pending' },
    });

    expect(pendingSettlements).toHaveLength(0);

    const batches = await prisma.settlementBatch.findMany();
    expect(batches).toHaveLength(0);
  });
});
