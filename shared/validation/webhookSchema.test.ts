import test from 'node:test';
import assert from 'node:assert';
import { createWebhookUrlSchema, WebhookUrlSchema } from './webhookSchema.js';

test('createWebhookUrlSchema - format & length rules apply in every environment', async (t) => {
  await t.test('rejects a non-URL string', () => {
    const schema = createWebhookUrlSchema('production');
    assert.throws(() => schema.parse('not-a-url'), /valid URL/);
  });

  await t.test('rejects a URL exceeding 2048 characters', () => {
    const schema = createWebhookUrlSchema('development');
    const long = 'https://example.com/' + 'a'.repeat(2048);
    assert.throws(() => schema.parse(long), /2048/);
  });
});

test('createWebhookUrlSchema - production mode', async (t) => {
  const schema = createWebhookUrlSchema('production');

  await t.test('accepts a public HTTPS URL', () => {
    const result = schema.parse('https://example.com/hook');
    assert.strictEqual(result, 'https://example.com/hook');
  });

  await t.test('rejects HTTP URLs', () => {
    assert.throws(() => schema.parse('http://example.com/hook'), /HTTPS/);
  });

  await t.test('rejects localhost', () => {
    assert.throws(() => schema.parse('https://localhost/hook'), /localhost|private/);
  });

  await t.test('rejects 127.0.0.1', () => {
    assert.throws(() => schema.parse('https://127.0.0.1/hook'), /localhost|private/);
  });

  await t.test('rejects private IP range 192.168.x.x', () => {
    assert.throws(() => schema.parse('https://192.168.1.1/hook'), /localhost|private/);
  });

  await t.test('rejects private IP range 10.x.x.x', () => {
    assert.throws(() => schema.parse('https://10.0.0.1/hook'), /localhost|private/);
  });

  await t.test('rejects private IP range 172.16-31.x.x', () => {
    assert.throws(() => schema.parse('https://172.16.0.1/hook'), /localhost|private/);
  });

  await t.test('accepts a public IP address', () => {
    const result = schema.parse('https://93.184.216.34/hook');
    assert.strictEqual(result, 'https://93.184.216.34/hook');
  });
});

test('createWebhookUrlSchema - development mode', async (t) => {
  const schema = createWebhookUrlSchema('development');

  await t.test('accepts HTTP URLs', () => {
    const result = schema.parse('http://example.com/hook');
    assert.strictEqual(result, 'http://example.com/hook');
  });

  await t.test('accepts HTTPS URLs', () => {
    const result = schema.parse('https://example.com/hook');
    assert.strictEqual(result, 'https://example.com/hook');
  });

  await t.test('accepts localhost', () => {
    const result = schema.parse('http://localhost:3000/hook');
    assert.strictEqual(result, 'http://localhost:3000/hook');
  });
});

test('WebhookUrlSchema (default export)', async (t) => {
  await t.test('is a usable schema instance', () => {
    const result = WebhookUrlSchema.safeParse('https://example.com/hook');
    assert.strictEqual(result.success, true);
  });

  await t.test('still rejects malformed URLs regardless of environment', () => {
    const result = WebhookUrlSchema.safeParse('not-a-url');
    assert.strictEqual(result.success, false);
  });
});