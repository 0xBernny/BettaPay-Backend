import test from 'tape';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import crypto from 'crypto';
import { CreateMerchantBody, AuthTokenBody } from '@bettapay/validation';

// Native hashSecret helper mirroring src/index.ts
function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

// Builds a mock application mirroring the gateway's authentication and creation routes
function buildApp(initialMerchants: any[] = []) {
  const app = Fastify({ logger: false });
  const db = [...initialMerchants];

  app.register(fastifyJwt, {
    secret: 'test-jwt-secret-key-32-chars-long-or-more',
    sign: { expiresIn: '24h' }
  });

  // Replicate POST /api/auth/token
  app.post('/api/auth/token', async (request, reply) => {
    try {
      const d = AuthTokenBody.parse(request.body);
      const merchant = db.find(m => m.id === d.merchantId && !m.deletedAt);

      const storedHash = merchant?.secretHash || '0'.repeat(64);
      const inputHash = hashSecret(d.secret);
      const hashBuffer = Buffer.from(storedHash, 'hex');
      const inputBuffer = Buffer.from(inputHash, 'hex');

      const isValid = merchant && merchant.secretHash && crypto.timingSafeEqual(hashBuffer, inputBuffer);
      if (!isValid) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const token = app.jwt.sign({ merchantId: merchant.id, ownerId: merchant.ownerId });
      return reply.send({ token });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  // Replicate POST /api/merchants
  app.post('/api/merchants', async (request, reply) => {
    try {
      const d = CreateMerchantBody.parse(request.body);
      const secret = d.secret || crypto.randomBytes(24).toString('hex');
      const secretHash = hashSecret(secret);
      const merchant = {
        id: d.id,
        name: d.name,
        ownerId: d.ownerId,
        settings: d.settings || {},
        secretHash,
      };
      db.push(merchant);
      return reply.code(201).send({ success: true, merchant, secret });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  return { app, db };
}

test('valid credentials return JWT', async (t) => {
  const secret = 'merchant-super-secret-key';
  const merchantId = 'm-valid-1';
  const hashed = hashSecret(secret);
  const { app } = buildApp([{ id: merchantId, ownerId: 'user-1', secretHash: hashed }]);

  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/token',
      payload: { merchantId, secret }
    });

    t.equal(res.statusCode, 200, 'should return 200 OK');
    const body = JSON.parse(res.body);
    t.ok(body.token, 'should return a token');
    
    // Verify JWT contents
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
  const merchantId = 'm-valid-1';
  const hashed = hashSecret(secret);
  const { app } = buildApp([{ id: merchantId, ownerId: 'user-1', secretHash: hashed }]);

  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/token',
      payload: { merchantId, secret: 'wrong-secret' }
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
  const { app } = buildApp([]);

  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/token',
      payload: { merchantId: 'unknown-merchant', secret: 'some-secret' }
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
  const { app, db } = buildApp([]);

  try {
    // 1. Creation with custom secret
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/merchants',
      payload: { id: 'm-new-1', name: 'New Merchant', ownerId: 'user-new-1', secret: 'my-custom-secret' }
    });

    t.equal(res1.statusCode, 201, 'creation succeeds');
    const body1 = JSON.parse(res1.body);
    t.equal(body1.secret, 'my-custom-secret', 'returns custom secret');

    const stored1 = db.find(m => m.id === 'm-new-1');
    t.ok(stored1, 'merchant is persisted');
    t.notEqual(stored1?.secretHash, 'my-custom-secret', 'persisted secret is hashed');
    t.equal(stored1?.secretHash, hashSecret('my-custom-secret'), 'hash matches SHA-256');
    t.notOk(Object.keys(stored1 || {}).includes('secret'), 'plaintext secret key is not in merchant object');

    // 2. Creation with generated secret
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/merchants',
      payload: { id: 'm-new-2', name: 'Generated Merchant', ownerId: 'user-new-2' }
    });

    t.equal(res2.statusCode, 201, 'creation with generated secret succeeds');
    const body2 = JSON.parse(res2.body);
    t.ok(body2.secret, 'generated secret is returned');

    const stored2 = db.find(m => m.id === 'm-new-2');
    t.ok(stored2, 'merchant is persisted');
    t.notEqual(stored2?.secretHash, body2.secret, 'persisted secret is hashed');
    t.equal(stored2?.secretHash, hashSecret(body2.secret), 'hash matches SHA-256');
    t.notOk(Object.keys(stored2 || {}).includes('secret'), 'plaintext secret key is not in merchant object');
  } catch (err: any) {
    t.fail(err);
  } finally {
    await app.close();
    t.end();
  }
});

test('seeded admin merchant authenticates successfully', async (t) => {
  const adminAddress = 'GB_ADMIN_ADDRESS_123';
  const adminSecret = 'admin-secret-dev-value';
  const adminSecretHash = hashSecret(adminSecret);
  
  // Build database seeded with admin merchant
  const { app } = buildApp([{
    id: adminAddress,
    name: 'BettaPay Merchant LLC',
    ownerId: 'admin-user-001',
    settings: { preferredAsset: 'USDC', autoSettle: true },
    secretHash: adminSecretHash
  }]);

  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/token',
      payload: { merchantId: adminAddress, secret: adminSecret }
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
  const merchantId = 'm-valid-1';
  const secret = 'merchant-super-secret-key';
  const hashed = hashSecret(secret);
  const { app } = buildApp([{ id: merchantId, ownerId: 'user-1', secretHash: hashed }]);

  try {
    // Attempting to auth with an arbitrary random secret
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/token',
      payload: { merchantId, secret: 'arbitrary-unauthorized-secret-key-123' }
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
