import test from 'tape';
import crypto from 'crypto';
import { createTestApp, generateTestJwt } from './test-utils.js';

const VALID_STELLAR_PUBLIC_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const OTHER_STELLAR_PUBLIC_KEY = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

test('valid credentials return JWT', async (t) => {
  const secret = 'merchant-super-secret-key';
  const merchantId = VALID_STELLAR_PUBLIC_KEY;
  const hashed = hashSecret(secret);
  const { app } = createTestApp({}, {
    merchants: [{ id: merchantId, ownerId: 'user-1', secretHash: hashed }],
  });

  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/token',
      payload: { merchantId, secret },
    });

    t.equal(res.statusCode, 200, 'should return 200 OK');
    const body = JSON.parse(res.body);
    t.ok(body.token, 'should return a token');

    const payload = app.jwt.decode(body.token) as any;
    t.equal(payload.merchantId, merchantId, 'JWT contains correct merchant ID');
    t.equal(payload.ownerId, 'user-1', 'JWT contains correct owner ID');
  } catch (err: any) {
    t.fail(err);
  } finally {
    await app.close();
    t.end();
  }
});

test('invalid secret returns 401', async (t) => {
  const secret = 'merchant-super-secret-key';
  const merchantId = VALID_STELLAR_PUBLIC_KEY;
  const hashed = hashSecret(secret);
  const { app } = createTestApp({}, {
    merchants: [{ id: merchantId, ownerId: 'user-1', secretHash: hashed }],
  });

  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/token',
      payload: { merchantId, secret: 'wrong-secret' },
    });

    t.equal(res.statusCode, 401, 'should return 401 Unauthorized');
    const body = JSON.parse(res.body);
    t.equal(body.error, 'Invalid credentials', 'should return exact error message');
  } catch (err: any) {
    t.fail(err);
  } finally {
    await app.close();
    t.end();
  }
});

test('unknown merchant returns 401', async (t) => {
  const { app } = createTestApp({}, { merchants: [] });

  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/token',
      payload: { merchantId: OTHER_STELLAR_PUBLIC_KEY, secret: 'some-secret' },
    });

    t.equal(res.statusCode, 401, 'should return 401 Unauthorized for unknown merchant');
    const body = JSON.parse(res.body);
    t.equal(body.error, 'Invalid credentials', 'should return exact error message');
  } catch (err: any) {
    t.fail(err);
  } finally {
    await app.close();
    t.end();
  }
});

test('merchant creation hashes secrets and plaintext secrets are never persisted', async (t) => {
  const { app, mockPrisma } = createTestApp({}, { merchants: [] });
  const token = generateTestJwt(app);

  try {
    // 1. Creation with custom secret
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/merchants',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: 'm-new-1',
        name: 'New Merchant',
        ownerId: VALID_STELLAR_PUBLIC_KEY,
        secret: 'my-custom-secret',
      },
    });

    t.equal(res1.statusCode, 201, 'creation succeeds');
    const body1 = JSON.parse(res1.body);
    t.equal(body1.secret, 'my-custom-secret', 'returns custom secret');

    const stored1 = await mockPrisma.merchant.findUnique({ where: { id: 'm-new-1' } });
    t.ok(stored1, 'merchant is persisted in mock DB');
    t.notEqual(stored1?.secretHash, 'my-custom-secret', 'persisted secret is hashed');
    t.equal(stored1?.secretHash, hashSecret('my-custom-secret'), 'hash matches SHA-256');

    // 2. Creation with generated secret
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/merchants',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        id: 'm-new-2',
        name: 'Generated Merchant',
        ownerId: OTHER_STELLAR_PUBLIC_KEY,
      },
    });

    t.equal(res2.statusCode, 201, 'creation with generated secret succeeds');
    const body2 = JSON.parse(res2.body);
    t.ok(body2.secret, 'generated secret is returned');

    const stored2 = await mockPrisma.merchant.findUnique({ where: { id: 'm-new-2' } });
    t.ok(stored2, 'merchant is persisted in mock DB');
    t.notEqual(stored2?.secretHash, body2.secret, 'persisted secret is hashed');
    t.equal(stored2?.secretHash, hashSecret(body2.secret), 'hash matches SHA-256');
  } catch (err: any) {
    t.fail(err);
  } finally {
    await app.close();
    t.end();
  }
});

test('seeded admin merchant authenticates successfully', async (t) => {
  const adminAddress = VALID_STELLAR_PUBLIC_KEY;
  const adminSecret = 'admin-secret-dev-value';
  const adminSecretHash = hashSecret(adminSecret);

  const { app } = createTestApp({}, {
    merchants: [{
      id: adminAddress,
      name: 'BettaPay Merchant LLC',
      ownerId: 'admin-user-001',
      settings: { preferredAsset: 'USDC', autoSettle: true },
      secretHash: adminSecretHash,
    }],
  });

  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/token',
      payload: { merchantId: adminAddress, secret: adminSecret },
    });

    t.equal(res.statusCode, 200, 'admin authenticates successfully');
    const body = JSON.parse(res.body);
    t.ok(body.token, 'returns a JWT token for admin');
  } catch (err: any) {
    t.fail(err);
  } finally {
    await app.close();
    t.end();
  }
});

test('regression test: arbitrary secrets can no longer obtain a JWT', async (t) => {
  const merchantId = VALID_STELLAR_PUBLIC_KEY;
  const secret = 'merchant-super-secret-key';
  const hashed = hashSecret(secret);
  const { app } = createTestApp({}, {
    merchants: [{ id: merchantId, ownerId: 'user-1', secretHash: hashed }],
  });

  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/token',
      payload: { merchantId, secret: 'arbitrary-unauthorized-secret-key-123' },
    });

    t.equal(res.statusCode, 401, 'arbitrary secret is rejected');
    const body = JSON.parse(res.body);
    t.equal(body.error, 'Invalid credentials', 'returns invalid credentials error');
  } catch (err: any) {
    t.fail(err);
  } finally {
    await app.close();
    t.end();
  }
});
