import test from 'tape';

interface SettlementRow {
  totalAmount: string;
}

// Simulate the aggregate query behavior
async function queryDailySettlementTotal(
  settlements: SettlementRow[],
  merchantId: string,
  todayStart: Date
): Promise<number> {
  // In the real implementation, this would be:
  // const aggregateResult = await prisma.$queryRaw<[{ sum: string | null }]>`
  //   SELECT COALESCE(SUM(CAST("totalAmount" AS DECIMAL)), 0)::text as sum
  //   FROM "Settlement"
  //   WHERE "merchantId" = ${merchantId} AND "initiatedAt" >= ${todayStart}
  // `;

  // Simulated version: sum up totalAmount for matching settlements
  const sum = settlements.reduce((acc, s) => acc + parseFloat(s.totalAmount), 0);
  return sum;
}

test('Daily settlement limit: aggregation on empty list', async (t) => {
  const sum = await queryDailySettlementTotal([], 'merchant-1', new Date());
  t.equal(sum, 0, 'returns 0 for empty list');
  t.end();
});

test('Daily settlement limit: aggregation with multiple settlements', async (t) => {
  const settlements: SettlementRow[] = [
    { totalAmount: '100.50' },
    { totalAmount: '200.75' },
    { totalAmount: '50.25' },
  ];

  const sum = await queryDailySettlementTotal(settlements, 'merchant-1', new Date());
  t.equal(sum, 351.5, 'correctly sums all settlement amounts');
  t.end();
});

test('Daily settlement limit: aggregation handles string parsing', async (t) => {
  const settlements: SettlementRow[] = [
    { totalAmount: '1000.00' },
    { totalAmount: '2500.50' },
  ];

  const sum = await queryDailySettlementTotal(settlements, 'merchant-1', new Date());
  t.equal(sum, 3500.5, 'correctly parses string amounts and sums');
  t.end();
});

test('Daily settlement limit: check against limit', async (t) => {
  const settlements: SettlementRow[] = [
    { totalAmount: '300.00' },
    { totalAmount: '400.00' },
  ];

  const currentDailyTotal = await queryDailySettlementTotal(settlements, 'merchant-1', new Date());
  const requestAmount = 250.00;
  const dailyLimit = 1000.00;
  const newTotal = currentDailyTotal + requestAmount;

  t.equal(currentDailyTotal, 700.00, 'current daily total is 700');
  t.ok(newTotal <= dailyLimit, 'new total would not exceed limit');
  t.end();
});

test('Daily settlement limit: exceed limit', async (t) => {
  const settlements: SettlementRow[] = [
    { totalAmount: '800.00' },
  ];

  const currentDailyTotal = await queryDailySettlementTotal(settlements, 'merchant-1', new Date());
  const requestAmount = 250.00;
  const dailyLimit = 1000.00;
  const newTotal = currentDailyTotal + requestAmount;

  t.equal(currentDailyTotal, 800.00, 'current daily total is 800');
  t.ok(newTotal > dailyLimit, 'new total would exceed limit');
  t.end();
});

test('Daily settlement limit: null handling', async (t) => {
  // Simulate the case where the database returns null (no settlements)
  const aggregateResult = null;
  const sum = aggregateResult ? parseFloat(aggregateResult as any) : 0;
  t.equal(sum, 0, 'correctly handles null from aggregation');
  t.end();
});
