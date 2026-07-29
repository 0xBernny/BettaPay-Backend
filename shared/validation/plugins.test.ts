import test from 'node:test';
import assert from 'node:assert';
import Fastify from 'fastify';
import { z } from 'zod';
import { registerErrorHandler, registerServiceAuth, redactPiiFromDetails } from './plugins.js';

test('Zod validation error returns 400', async (t) => {
  const fastify = Fastify({ logger: false });
  registerErrorHandler(fastify);

  const schema = z.object({ age: z.number() });

  fastify.post('/', (req, reply) => {
    schema.parse(req.body);
    reply.send({ ok: true });
  });

  const response = await fastify.inject({
    method: 'POST',
    url: '/',
    payload: { age: 'not a number' }
  });

  assert.strictEqual(response.statusCode, 400);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.error.code, 'VALIDATION_ERROR');
  assert.strictEqual(body.error.message, 'Invalid request data');
  assert.ok(Array.isArray(body.error.details));
});

test('Fastify error returns expected status code and preserves message', async (t) => {
  const fastify = Fastify({ logger: false });
  registerErrorHandler(fastify);

  fastify.get('/', () => {
    const err: any = new Error('Rate limit exceeded');
    err.statusCode = 429;
    err.code = 'RATE_LIMIT';
    throw err;
  });

  const response = await fastify.inject({ method: 'GET', url: '/' });

  assert.strictEqual(response.statusCode, 429);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.error.code, 'RATE_LIMIT');
  assert.strictEqual(body.error.message, 'Rate limit exceeded');
});

test('Generic error returns 500 and does not leak stack trace', async (t) => {
  const fastify = Fastify({ logger: false });
  
  let logged = false;
  const mockLogger: any = {
    error: () => { logged = true; },
    info: () => {},
    warn: () => {},
    debug: () => {},
    fatal: () => {},
    trace: () => {},
    child: () => mockLogger
  };
  
  registerErrorHandler(fastify, mockLogger);

  fastify.get('/', () => {
    throw new Error('Database connection failed');
  });

  const response = await fastify.inject({ method: 'GET', url: '/' });

  assert.strictEqual(response.statusCode, 500);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.error.code, 'INTERNAL_ERROR');
  assert.strictEqual(body.error.message, 'Internal server error');
  assert.strictEqual(body.error.details, undefined);
  assert.strictEqual(response.body.includes('Database connection failed'), false);
  assert.strictEqual(logged, true, 'Logger should be called when error occurs');
});

const SERVICE_SECRET = 'shared-inter-service-secret';

function buildServiceAuthApp() {
  const app = Fastify({ logger: false });
  registerServiceAuth(app, SERVICE_SECRET);
  app.get('/internal', { preValidation: [app.serviceAuth] }, async () => ({ ok: true }));
  return app;
}

test('serviceAuth rejects a request without x-service-token', async () => {
  const app = buildServiceAuthApp();
  const res = await app.inject({ method: 'GET', url: '/internal' });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(JSON.parse(res.body).error.code, 'UNAUTHORIZED');
});

test('serviceAuth rejects an invalid x-service-token', async () => {
  const app = buildServiceAuthApp();
  const res = await app.inject({ method: 'GET', url: '/internal', headers: { 'x-service-token': 'nope' } });
  assert.strictEqual(res.statusCode, 401);
});

test('serviceAuth accepts a valid x-service-token', async () => {
  const app = buildServiceAuthApp();
  const res = await app.inject({ method: 'GET', url: '/internal', headers: { 'x-service-token': SERVICE_SECRET } });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(JSON.parse(res.body).ok, true);
});

test('redactPiiFromDetails redacts email field messages', () => {
  const details = [{ path: ['email'], message: 'user@example.com is invalid' }];
  const result = redactPiiFromDetails(details) as any;
  assert.strictEqual(result[0].message, '[REDACTED]');
});

test('redactPiiFromDetails redacts secret key field messages', () => {
  const details = [{ path: ['secretKey'], message: 'sk_live_abc123 is invalid' }];
  const result = redactPiiFromDetails(details) as any;
  assert.strictEqual(result[0].message, '[REDACTED]');
});

test('redactPiiFromDetails preserves non-PII field messages', () => {
  const details = [{ path: ['amount'], message: 'Must be a positive number' }];
  const result = redactPiiFromDetails(details) as any;
  assert.strictEqual(result[0].message, 'Must be a positive number');
});

test('redactPiiFromDetails preserves error structure', () => {
  const details = [
    { path: ['email'], message: 'user@example.com is invalid' },
    { path: ['amount'], message: 'Must be a positive number' },
    { path: ['secretKey'], message: 'sk_live_abc123 is invalid' },
  ];
  const result = redactPiiFromDetails(details) as any;
  assert.strictEqual(result[0].message, '[REDACTED]');
  assert.strictEqual(result[1].message, 'Must be a positive number');
  assert.strictEqual(result[2].message, '[REDACTED]');
  assert.strictEqual(result.length, 3);
});

test('Zod error handler redacts PII from response', async (t) => {
  const fastify = Fastify({ logger: false });
  registerErrorHandler(fastify);
  const schema = z.object({ email: z.string().email() });
  fastify.post('/', (req, reply) => {
    schema.parse(req.body);
    reply.send({ ok: true });
  });
  const response = await fastify.inject({
    method: 'POST',
    url: '/',
    payload: { email: 'not-an-email' }
  });
  assert.strictEqual(response.statusCode, 400);
  const body = JSON.parse(response.body);
  assert.strictEqual(body.error.details[0].message, '[REDACTED]');
});

test('error handler does not leak PII in message', async (t) => {
  const fastify = Fastify({ logger: false });
  registerErrorHandler(fastify);
  fastify.post('/', (req, reply) => {
    const schema = z.object({
      email: z.string().refine(() => false, { message: 'user@example.com is invalid' })
    });
    schema.parse(req.body);
    reply.send({ ok: true });
  });
  const response = await fastify.inject({
    method: 'POST',
    url: '/',
    payload: { email: 'anything' }
  });
  const body = JSON.parse(response.body);
  assert.strictEqual(body.error.details[0].message, '[REDACTED]');
  assert.strictEqual(response.body.includes('user@example.com'), false);
});
