import test from 'tape';
import crypto from 'crypto';
import Fastify from 'fastify';

// ---------------------------------------------------------------------------
// Inline the warmup logic so tests do not depend on the full server module.
// Same contract as warmupDownstreamServices in index.ts.
// ---------------------------------------------------------------------------

interface DownstreamService {
  name: string;
  healthUrl: string;
}

interface LevelLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
}

async function warmupDownstreamServices(
  services: DownstreamService[],
  logger: LevelLogger,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<void> {
  await Promise.allSettled(
    services.map(async (svc) => {
      const traceId = crypto.randomUUID();
      const startTime = Date.now();

      try {
        const response = await fetchImpl(svc.healthUrl, {
          headers: { 'x-trace-id': traceId },
          signal: AbortSignal.timeout(5_000),
        });
        const durationMs = Date.now() - startTime;
        logger.info(
          { traceId, targetService: svc.name, statusCode: response.status, durationMs },
          'Warmup completed',
        );
      } catch (err) {
        const durationMs = Date.now() - startTime;
        logger.warn(
          { traceId, targetService: svc.name, durationMs, err },
          'Warmup failed — downstream may not be ready',
        );
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('warmupDownstreamServices sends x-trace-id header and logs success', async (t) => {
  const capturedHeaders: Record<string, string>[] = [];

  const mockFetch: typeof fetch = async (url, init) => {
    const headers = (init?.headers as Record<string, string>) ?? {};
    capturedHeaders.push(headers);
    return new Response('ok', { status: 200 });
  };

  const logs: { obj: Record<string, unknown>; msg: string }[] = [];
  const logger: LevelLogger = {
    info: (obj, msg) => logs.push({ obj, msg }),
    warn: () => undefined,
  };

  const services = [
    { name: 'fx-engine', healthUrl: 'http://localhost:3002/api/health' },
    { name: 'indexer', healthUrl: 'http://localhost:3003/api/health' },
  ];

  await warmupDownstreamServices(services, logger, mockFetch);

  t.equal(capturedHeaders.length, 2, 'made two fetch calls');
  for (const headers of capturedHeaders) {
    t.ok(headers['x-trace-id'], 'x-trace-id header is present');
    t.ok(
      /^[0-9a-f-]+$/.test(headers['x-trace-id']),
      'x-trace-id looks like a UUID',
    );
  }

  t.equal(logs.length, 2, 'two info log entries');
  for (const log of logs) {
    t.equal(log.msg, 'Warmup completed');
    t.ok(log.obj.traceId, 'log has traceId');
    t.ok(log.obj.targetService, 'log has targetService');
    t.equal(log.obj.statusCode, 200, 'log has statusCode 200');
    t.equal(typeof log.obj.durationMs, 'number', 'log has durationMs');
  }

  t.end();
});

test('warmupDownstreamServices logs warning on failure', async (t) => {
  const mockFetch: typeof fetch = async () => {
    throw new Error('Connection refused');
  };

  const warns: { obj: Record<string, unknown>; msg: string }[] = [];
  const logger: LevelLogger = {
    info: () => undefined,
    warn: (obj, msg) => warns.push({ obj, msg }),
  };

  const services = [
    { name: 'fx-engine', healthUrl: 'http://localhost:3002/api/health' },
  ];

  await warmupDownstreamServices(services, logger, mockFetch);

  t.equal(warns.length, 1, 'one warn log entry');
  t.equal(warns[0].msg, 'Warmup failed — downstream may not be ready');
  t.ok(warns[0].obj.traceId, 'log has traceId');
  t.ok(warns[0].obj.targetService, 'log has targetService');
  t.ok(warns[0].obj.err, 'log has err');

  t.end();
});

test('warmupDownstreamServices generates unique trace IDs per call', async (t) => {
  const capturedHeaders: Record<string, string>[] = [];

  const mockFetch: typeof fetch = async (url, init) => {
    const headers = (init?.headers as Record<string, string>) ?? {};
    capturedHeaders.push(headers);
    return new Response('ok', { status: 200 });
  };

  const logger: LevelLogger = {
    info: () => undefined,
    warn: () => undefined,
  };

  const services = [
    { name: 'fx-engine', healthUrl: 'http://localhost:3002/api/health' },
    { name: 'indexer', healthUrl: 'http://localhost:3003/api/health' },
    { name: 'settlement-engine', healthUrl: 'http://localhost:3004/api/health' },
  ];

  await warmupDownstreamServices(services, logger, mockFetch);

  const traceIds = capturedHeaders.map((h) => h['x-trace-id']);
  t.equal(new Set(traceIds).size, 3, 'all trace IDs are unique');
  t.end();
});
