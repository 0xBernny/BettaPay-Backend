import test from 'tape';
import { fastify, prisma, settlementQueue } from './index.js';
import { MOCK_MERCHANT_STANDARD, BATCH_VALID_STANDARD } from './test-fixtures.js';

// Setup environment variable for tests
process.env.NODE_ENV = 'test';

function resetMocks() {
  prisma.merchant.findUnique = async () => null;
  prisma.$queryRaw = async () => [{ sum: null }];
  prisma.$transaction = async (cb: any) => cb(prisma);
  prisma.settlement.create = async (args: any) => args.data;
  prisma.settlement.findMany = async () => [];
  settlementQueue.add = async () => ({} as any);
}

test('bulk-webhook: verifies webhookUrl is correctly propagated from merchant settings on creation', async (t) => {
  resetMocks();

  const createdRecords: any[] = [];
  
  // Custom merchant with fee rule and webhook configuration
  const customMerchant = {
    ...MOCK_MERCHANT_STANDARD,
    settings: {
      feeBps: 120,
      webhookUrl: 'https://api.merchant.com/webhooks/bettapay',
    },
  };

  prisma.merchant.findUnique = async () => customMerchant as any;
  
  prisma.settlement.create = async (args: any) => {
    createdRecords.push(args.data);
    return args.data;
  };

  const res = await fastify.inject({
    method: 'POST',
    url: '/api/settlements/bulk',
    payload: {
      merchantId: customMerchant.id,
      settlements: [
        { amount: '100.00', asset: 'USDC' },
      ],
    },
  });

  t.equal(res.statusCode, 201);
  t.equal(createdRecords.length, 1);
  t.equal(createdRecords[0].webhookUrl, 'https://api.merchant.com/webhooks/bettapay', 'webhookUrl should be populated in DB record');
  t.equal(createdRecords[0].feeBps, 120, 'feeBps should match merchant settings');
  t.end();
});

test('bulk-webhook: checks webhookUrl is null when merchant has no webhook configured', async (t) => {
  resetMocks();

  const createdRecords: any[] = [];
  const simpleMerchant = {
    ...MOCK_MERCHANT_STANDARD,
    settings: {
      feeBps: 100,
    },
  };

  prisma.merchant.findUnique = async () => simpleMerchant as any;
  prisma.settlement.create = async (args: any) => {
    createdRecords.push(args.data);
    return args.data;
  };

  const res = await fastify.inject({
    method: 'POST',
    url: '/api/settlements/bulk',
    payload: {
      merchantId: simpleMerchant.id,
      settlements: [
        { amount: '100.00', asset: 'USDC' },
      ],
    },
  });

  t.equal(res.statusCode, 201);
  t.equal(createdRecords[0].webhookUrl, null, 'webhookUrl should be null');
  t.end();
});
export {};
