import test from 'tape';
import { createTestApp, generateTestJwt } from './test-utils.js';

test('authorization: PATCH /api/merchants/:id/settings returns 401 without JWT', async (t) => {
  const { app } = await createTestApp({}, {
    merchants: [{ id: 'm1', settings: { tier: 'silver', autoSettle: true } }],
  });

  const res = await app.inject({
    method: 'PATCH',
    url: '/api/merchants/m1/settings',
    payload: { feeBps: 75 },
  });

  t.equal(res.statusCode, 401, 'returns 401 Unauthorized');
  await app.close();
  t.end();
});

test('updating feeBps merges into existing settings and persists in DB', async (t) => {
  const { app, mockPrisma } = await createTestApp({}, {
    merchants: [{ id: 'm1', settings: { tier: 'silver', autoSettle: true } }],
  });
  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'PATCH',
    url: '/api/merchants/m1/settings',
    headers: { authorization: `Bearer ${token}` },
    payload: { feeBps: 75 },
  });

  t.equal(res.statusCode, 200, 'returns 200');
  const settings = JSON.parse(res.body as string).data.merchant.settings;
  t.equal(settings.feeBps, 75, 'feeBps is set');
  t.equal(settings.autoSettle, true, 'unrelated settings are preserved');

  const stored = await mockPrisma.merchant.findUnique({ where: { id: 'm1' } });
  t.equal(stored.settings.feeBps, 75, 'persisted feeBps in mock database');

  await app.close();
  t.end();
});

test('updating a missing merchant returns 404', async (t) => {
  const { app } = await createTestApp({}, { merchants: [] });
  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'PATCH',
    url: '/api/merchants/m1/settings',
    headers: { authorization: `Bearer ${token}` },
    payload: { feeBps: 75 },
  });

  t.equal(res.statusCode, 404, 'returns 404');
  await app.close();
  t.end();
});

test('an out-of-range feeBps is rejected', async (t) => {
  const { app } = await createTestApp({}, {
    merchants: [{ id: 'm1', settings: {} }],
  });
  const token = generateTestJwt(app);

  const res = await app.inject({
    method: 'PATCH',
    url: '/api/merchants/m1/settings',
    headers: { authorization: `Bearer ${token}` },
    payload: { feeBps: 20000 },
  });

  t.equal(res.statusCode, 400, 'returns 400 for feeBps above 10000');
  await app.close();
  t.end();
});
