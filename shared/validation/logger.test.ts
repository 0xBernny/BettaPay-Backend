import test from 'node:test';
import assert from 'node:assert';
import { createLoggerOptions } from './logger.js';

test('createLoggerOptions uses an explicit level over env/default', () => {
  const opts = createLoggerOptions({ level: 'debug' });
  assert.strictEqual(opts.level, 'debug');
});

test('createLoggerOptions falls back to LOG_LEVEL env then info', () => {
  const prev = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'warn';
  assert.strictEqual(createLoggerOptions().level, 'warn');

  delete process.env.LOG_LEVEL;
  assert.strictEqual(createLoggerOptions().level, 'info', 'defaults to info');

  if (prev !== undefined) process.env.LOG_LEVEL = prev;
});

test('createLoggerOptions redacts sensitive fields', () => {
  const { redact } = createLoggerOptions();
  const paths = redact.paths;
  for (const field of ['secret', 'token', 'secretHash', 'password', 'authorization']) {
    assert.ok(
      paths.some((p) => p === field || p.endsWith(`.${field}`) || p.includes(field)),
      `redacts ${field}`,
    );
  }
  assert.strictEqual(redact.censor, '[REDACTED]');
});

test('createLoggerOptions provides compact req/res serializers', () => {
  const { serializers } = createLoggerOptions();
  const req = serializers.req({ method: 'GET', url: '/x', id: 'r1', ip: '127.0.0.1' });
  assert.deepStrictEqual(Object.keys(req).sort(), ['method', 'remoteAddress', 'requestId', 'url']);
  const res = serializers.res({ statusCode: 204 });
  assert.deepStrictEqual(res, { statusCode: 204 });
});

test('createLoggerOptions emits JSON (no transport) in production', () => {
  const opts = createLoggerOptions({ pretty: false });
  assert.strictEqual(opts.transport, undefined, 'no pretty transport when pretty=false');
});
