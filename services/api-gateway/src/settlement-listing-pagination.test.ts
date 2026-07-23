import test from 'tape';
import Fastify from 'fastify';
import { z } from 'zod';
import { ErrorCodes, createErrorResponse, SettlementListQuery } from '@bettapay/validation';

interface FakeSettlement {
  id: string;
  merchantId: string;
  totalAmount: string;
  grossAmount: string;
  feeAmount: string;
  netAmount: string;
  feeBps: number;
  asset: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  initiatedAt: Date;
  completedAt?: Date;
}

function buildApp(settlements: FakeSettlement[] = []) {
  const app = Fastify({ logger: false });

  app.get<{ Querystring: z.infer<typeof SettlementListQuery> & { merchantId?: string } }>('/api/settlements', async (request) => {
    const query = SettlementListQuery.parse(request.query);
    const { merchantId, status, from, to, limit, offset } = query as any;
    let filtered = settlements;

    if (merchantId) {
      filtered = filtered.filter((s) => s.merchantId === merchantId);
    }
    if (status) {
      filtered = filtered.filter((s) => s.status === status);
    }
    if (from) {
      const fromDate = new Date(from);
      filtered = filtered.filter((s) => s.initiatedAt >= fromDate);
    }
    if (to) {
      const toDate = new Date(to);
      filtered = filtered.filter((s) => s.initiatedAt <= toDate);
    }

    filtered.sort((a, b) => b.initiatedAt.getTime() - a.initiatedAt.getTime());
    const total = filtered.length;
    const records = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return {
      data: records,
      pagination: { total, limit, offset, hasMore },
    };
  });

  return app;
}

test('Settlement listing pagination: defaults', async (t) => {
  const settlements: FakeSettlement[] = [];
  for (let i = 0; i < 100; i++) {
    settlements.push({
      id: `s${i}`,
      merchantId: 'merchant-1',
      totalAmount: '100.00',
      grossAmount: '100.00',
      feeAmount: '0.00',
      netAmount: '100.00',
      feeBps: 0,
      asset: 'USDC',
      status: 'completed',
      initiatedAt: new Date(Date.now() - i * 60000),
    });
  }

  const app = buildApp(settlements);
  const res = await app.inject({
    method: 'GET',
    url: '/api/settlements',
  });

  t.equal(res.statusCode, 200, 'returns 200');
  const body = JSON.parse(res.body);
  t.equal(body.data.length, 50, 'returns 50 records by default');
  t.equal(body.pagination.total, 100, 'total is 100');
  t.equal(body.pagination.limit, 50, 'limit is 50');
  t.equal(body.pagination.offset, 0, 'offset is 0');
  t.ok(body.pagination.hasMore, 'hasMore is true');
  t.end();
});

test('Settlement listing pagination: with offset', async (t) => {
  const settlements: FakeSettlement[] = [];
  for (let i = 0; i < 100; i++) {
    settlements.push({
      id: `s${i}`,
      merchantId: 'merchant-1',
      totalAmount: '100.00',
      grossAmount: '100.00',
      feeAmount: '0.00',
      netAmount: '100.00',
      feeBps: 0,
      asset: 'USDC',
      status: 'completed',
      initiatedAt: new Date(Date.now() - i * 60000),
    });
  }

  const app = buildApp(settlements);
  const res = await app.inject({
    method: 'GET',
    url: '/api/settlements?limit=20&offset=50',
  });

  t.equal(res.statusCode, 200, 'returns 200');
  const body = JSON.parse(res.body);
  t.equal(body.data.length, 20, 'returns 20 records');
  t.equal(body.pagination.total, 100, 'total is 100');
  t.equal(body.pagination.limit, 20, 'limit is 20');
  t.equal(body.pagination.offset, 50, 'offset is 50');
  t.ok(body.pagination.hasMore, 'hasMore is true');
  t.end();
});

test('Settlement listing pagination: last page', async (t) => {
  const settlements: FakeSettlement[] = [];
  for (let i = 0; i < 75; i++) {
    settlements.push({
      id: `s${i}`,
      merchantId: 'merchant-1',
      totalAmount: '100.00',
      grossAmount: '100.00',
      feeAmount: '0.00',
      netAmount: '100.00',
      feeBps: 0,
      asset: 'USDC',
      status: 'completed',
      initiatedAt: new Date(Date.now() - i * 60000),
    });
  }

  const app = buildApp(settlements);
  const res = await app.inject({
    method: 'GET',
    url: '/api/settlements?limit=50&offset=50',
  });

  t.equal(res.statusCode, 200, 'returns 200');
  const body = JSON.parse(res.body);
  t.equal(body.data.length, 25, 'returns 25 records (last page)');
  t.equal(body.pagination.total, 75, 'total is 75');
  t.equal(body.pagination.limit, 50, 'limit is 50');
  t.equal(body.pagination.offset, 50, 'offset is 50');
  t.notOk(body.pagination.hasMore, 'hasMore is false');
  t.end();
});

test('Settlement listing pagination: max limit enforcement', async (t) => {
  const settlements: FakeSettlement[] = [];
  for (let i = 0; i < 300; i++) {
    settlements.push({
      id: `s${i}`,
      merchantId: 'merchant-1',
      totalAmount: '100.00',
      grossAmount: '100.00',
      feeAmount: '0.00',
      netAmount: '100.00',
      feeBps: 0,
      asset: 'USDC',
      status: 'completed',
      initiatedAt: new Date(Date.now() - i * 60000),
    });
  }

  const app = buildApp(settlements);
  const res = await app.inject({
    method: 'GET',
    url: '/api/settlements?limit=300',
  });

  t.equal(res.statusCode, 200, 'returns 200');
  const body = JSON.parse(res.body);
  t.equal(body.pagination.limit, 200, 'limit is capped at 200');
  t.end();
});

test('Settlement listing pagination: with merchantId filter', async (t) => {
  const settlements: FakeSettlement[] = [
    {
      id: 's1',
      merchantId: 'merchant-1',
      totalAmount: '100.00',
      grossAmount: '100.00',
      feeAmount: '0.00',
      netAmount: '100.00',
      feeBps: 0,
      asset: 'USDC',
      status: 'completed',
      initiatedAt: new Date(),
    },
    {
      id: 's2',
      merchantId: 'merchant-2',
      totalAmount: '200.00',
      grossAmount: '200.00',
      feeAmount: '0.00',
      netAmount: '200.00',
      feeBps: 0,
      asset: 'USDC',
      status: 'completed',
      initiatedAt: new Date(Date.now() - 60000),
    },
  ];

  const app = buildApp(settlements);
  const res = await app.inject({
    method: 'GET',
    url: '/api/settlements?merchantId=merchant-1',
  });

  t.equal(res.statusCode, 200, 'returns 200');
  const body = JSON.parse(res.body);
  t.equal(body.data.length, 1, 'returns 1 record for merchant-1');
  t.equal(body.data[0].id, 's1', 'correct settlement returned');
  t.equal(body.pagination.total, 1, 'total is 1');
  t.end();
});
