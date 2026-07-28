import test from 'tape';
import { createTestApp, generateTestJwt } from './test-utils.js';

test('authorization: PATCH /api/settlements/:id/status returns 401 without valid JWT', async (t) => {
  const { app } = createTestApp({}, {
    settlements: [{ id: 'set_1', status: 'PENDING', merchantId: 'm1', totalAmount: '100.00', completedAt: null }],
  });

  const res = await app.inject({
    method: 'PATCH',
    url: '/api/settlements/set_1/status',
    payload: { status: 'processing' },
  });

  t.equal(res.statusCode, 401, 'returns 401 Unauthorized without JWT');
  await app.close();
  t.end();
});

test('PENDING transitions to processing and persists in DB', async (t) => {
  const { app, mockPrisma } = createTestApp({}, {
    settlements: [{ id: 'set_1', status: 'PENDING', merchantId: 'm1', totalAmount: '100.00', completedAt: null }],
  });
  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'PATCH',
    url: '/api/settlements/set_1/status',
    headers: { authorization: `Bearer ${token}` },
    payload: { status: 'processing' },
  });

  t.equal(res.statusCode, 200, 'returns 200');
  t.equal(JSON.parse(res.body).status, 'processing', 'updates to processing');

  const stored = await mockPrisma.settlement.findUnique({ where: { id: 'set_1' } });
  t.equal(stored.status, 'processing', 'updates status in mock DB');

  await app.close();
  t.end();
});

test('PROCESSING transitions to completed and sets completedAt in DB', async (t) => {
  const { app, mockPrisma } = createTestApp({}, {
    settlements: [{ id: 'set_1', status: 'PROCESSING', merchantId: 'm1', totalAmount: '100.00', completedAt: null }],
  });
  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'PATCH',
    url: '/api/settlements/set_1/status',
    headers: { authorization: `Bearer ${token}` },
    payload: { status: 'completed' },
  });

  t.equal(res.statusCode, 200, 'returns 200');
  const body = JSON.parse(res.body);
  t.equal(body.status, 'completed', 'updates to completed');
  t.ok(body.completedAt, 'sets completedAt on terminal status');

  const stored = await mockPrisma.settlement.findUnique({ where: { id: 'set_1' } });
  t.ok(stored.completedAt, 'persists completedAt timestamp in mock DB');

  await app.close();
  t.end();
});

test('invalid transition returns 422', async (t) => {
  const { app } = createTestApp({}, {
    settlements: [{ id: 'set_1', status: 'PENDING', merchantId: 'm1', totalAmount: '100.00', completedAt: null }],
  });
  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'PATCH',
    url: '/api/settlements/set_1/status',
    headers: { authorization: `Bearer ${token}` },
    payload: { status: 'completed' },
  });

  t.equal(res.statusCode, 422, 'returns 422');
  const body = JSON.parse(res.body);
  t.equal(body.error.details.from, 'PENDING', 'reports current status');
  t.ok(Array.isArray(body.error.details.allowedTransitions), 'includes allowedTransitions in error');

  await app.close();
  t.end();
});

test('missing settlement returns 404', async (t) => {
  const { app } = createTestApp({}, { settlements: [] });
  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'PATCH',
    url: '/api/settlements/missing_set/status',
    headers: { authorization: `Bearer ${token}` },
    payload: { status: 'processing' },
  });

  t.equal(res.statusCode, 404, 'returns 404');
  await app.close();
  t.end();
});
