import test from 'tape';
import zlib from 'zlib';
import { buildApp } from './index.js';
import { createMockPrisma } from './test-utils.js';

const BODY_LIMIT = 1_048_576;

function gzipJson(payload: unknown): Buffer {
  return zlib.gzipSync(Buffer.from(JSON.stringify(payload)));
}

// Builds a gzip payload whose decompressed JSON body is exactly `targetBytes` long.
function gzipJsonOfExactSize(targetBytes: number): Buffer {
  const overhead = JSON.stringify({ address: 'GTESTADDRESS', padding: '' }).length;
  const json = JSON.stringify({ address: 'GTESTADDRESS', padding: 'a'.repeat(targetBytes - overhead) });
  return zlib.gzipSync(Buffer.from(json));
}

test('Fastify uses the configured request body size limits on gateway app', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });
  t.equal(app.initialConfig.bodyLimit, 1_048_576, 'bodyLimit is configured to exactly 1,048,576 bytes (1MB)');
  await app.close();
  t.end();
});

test('payload above limit is rejected with HTTP 413 on gateway app', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });
  const payload = 'a'.repeat(BODY_LIMIT + 1);

  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/token',
    headers: {
      'content-type': 'application/json',
    },
    payload,
  });

  t.equal(response.statusCode, 413, 'returns 413 Payload Too Large');
  const body = JSON.parse(response.body);
  t.equal(body.error.code, 'FST_ERR_CTP_BODY_TOO_LARGE', 'reports the body-too-large error code');
  t.match(body.error.message, /too large/i, 'message mentions the oversized body');

  await app.close();
  t.end();
});

test('gzip body decompressing to ~500KB is accepted', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });
  const payload = gzipJson({ address: 'GTESTADDRESS', padding: 'a'.repeat(500_000) });

  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/challenge',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'gzip',
    },
    payload,
  });

  t.ok([200, 201].includes(response.statusCode), `returns 2xx, got ${response.statusCode}`);

  await app.close();
  t.end();
});

test('gzip body decompressing to ~1.5MB is rejected with 413', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });
  const payload = gzipJson({ address: 'GTESTADDRESS', padding: 'a'.repeat(1_500_000) });

  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/challenge',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'gzip',
    },
    payload,
  });

  t.equal(response.statusCode, 413, 'returns 413 Payload Too Large');

  await app.close();
  t.end();
});

test('invalid gzip stream is rejected with 400', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });
  const payload = Buffer.from('this is not a valid gzip stream');

  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/challenge',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'gzip',
    },
    payload,
  });

  t.equal(response.statusCode, 400, 'returns 400 for an invalid gzip stream');

  await app.close();
  t.end();
});

test('gzip body decompressing to exactly 1 MB is accepted', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });
  const payload = gzipJsonOfExactSize(BODY_LIMIT);

  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/challenge',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'gzip',
    },
    payload,
  });

  t.ok([200, 201].includes(response.statusCode), `returns 2xx, got ${response.statusCode}`);

  await app.close();
  t.end();
});

test('gzip body decompressing to 1 MB + 1 byte is rejected with 413', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });
  const payload = gzipJsonOfExactSize(BODY_LIMIT + 1);

  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/challenge',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'gzip',
    },
    payload,
  });

  t.equal(response.statusCode, 413, 'returns 413 Payload Too Large');

  await app.close();
  t.end();
});

test('Content-Encoding: identity skips decompression', async (t) => {
  const app = buildApp({ prisma: createMockPrisma() as any, logger: false });
  const payload = JSON.stringify({ address: 'GTESTADDRESS' });

  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/challenge',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'identity',
    },
    payload,
  });

  t.ok([200, 201].includes(response.statusCode), `returns 2xx, got ${response.statusCode}`);

  await app.close();
  t.end();
});
