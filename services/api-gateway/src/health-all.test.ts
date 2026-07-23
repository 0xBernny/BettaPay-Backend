import test from 'node:test';
import assert from 'node:assert/strict';
import type { HealthResponse } from '../../../shared/validation/schemas.js';
import { buildApp } from './index.js';
import { createMockPrisma } from './test-utils.js';

function mockHealth(service: string, status: HealthResponse['status']): HealthResponse {
  return {
    status,
    service,
    version: '0.1.0',
    uptime: 42,
    lastDependencyCheck: new Date().toISOString(),
    dependencies: [{
      name: 'redis',
      status: status === 'unhealthy' ? 'disconnected' : 'connected',
      latencyMs: 2,
    }],
  };
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

test('GET /api/health/all aggregates downstream health with graceful degradation', async () => {
  const prisma = createMockPrisma() as any;

  const fetchImpl = async (url: string | URL | Request) => {
    const target = String(url);
    if (target.includes('3002')) return jsonResponse(mockHealth('fx-engine', 'healthy'));
    if (target.includes('3001')) return jsonResponse(mockHealth('settlement-engine', 'degraded'));
    if (target.includes('3003')) throw new Error('indexer unavailable');
    return jsonResponse(mockHealth('unknown', 'healthy'));
  };

  const app = buildApp({
    prisma,
    logger: false,
    fetchImpl: fetchImpl as any
  });

  const res = await app.inject({ method: 'GET', url: '/api/health/all' });
  assert.equal(res.statusCode, 503);

  const body = JSON.parse(res.body);
  assert.equal(body.status, 'unhealthy');
  assert.equal(body.service, 'api-gateway');
  assert.ok(body.services['api-gateway']);
  assert.equal(body.services['fx-engine'].status, 'healthy');
  assert.equal(body.services['settlement-engine'].status, 'degraded');
  assert.equal(body.services.indexer.status, 'unhealthy');
  assert.ok(body.services.indexer.error);

  await app.close();
});

test('GET /api/health returns gateway dependency and upstream probes', async () => {
  const prisma = createMockPrisma() as any;

  const app = buildApp({
    prisma,
    logger: false,
    fetchImpl: (async () => jsonResponse(mockHealth('service', 'healthy'))) as any
  });

  const res = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(res.statusCode, 200);

  const body = JSON.parse(res.body);
  assert.equal(body.service, 'api-gateway');
  assert.ok(Array.isArray(body.dependencies));
  assert.ok(Array.isArray(body.upstream));
  assert.equal(body.dependencies[0].name, 'postgresql');
  assert.equal(body.upstream.length, 3);

  await app.close();
});
