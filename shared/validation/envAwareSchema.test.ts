import test from 'node:test';
import assert from 'node:assert';
import { createValidationContext } from './envAwareSchema.js';
import { createWebhookUrlSchema } from './webhookSchema.js';
import { createCorsOriginsSchema } from './cors.js';

test('EnvAwareSchema Factory - defaults to development when NODE_ENV is undefined', () => {
  const ctx = createValidationContext(undefined);
  assert.strictEqual(ctx.isProduction, false);
  assert.strictEqual(ctx.env, 'development');
});

test('EnvAwareSchema Factory - sets isProduction=true when NODE_ENV=production', () => {
  const ctx = createValidationContext('production');
  assert.strictEqual(ctx.isProduction, true);
  assert.strictEqual(ctx.env, 'production');
});

test('EnvAwareSchema Factory - sets isProduction=false when NODE_ENV=development', () => {
  const ctx = createValidationContext('development');
  assert.strictEqual(ctx.isProduction, false);
  assert.strictEqual(ctx.env, 'development');
});

test('EnvAwareSchema Factory - sets isProduction=false when NODE_ENV=test', () => {
  const ctx = createValidationContext('test');
  assert.strictEqual(ctx.isProduction, false);
  assert.strictEqual(ctx.env, 'test');
});

test('Webhook URL Schema - Production mode - rejects HTTP URLs', () => {
  const schema = createWebhookUrlSchema('production');
  const result = schema.safeParse('http://example.com/webhook');
  assert.strictEqual(result.success, false);
});

test('Webhook URL Schema - Production mode - accepts HTTPS URLs', () => {
  const schema = createWebhookUrlSchema('production');
  const result = schema.safeParse('https://example.com/webhook');
  assert.strictEqual(result.success, true);
});

test('Webhook URL Schema - Production mode - rejects invalid URLs', () => {
  const schema = createWebhookUrlSchema('production');
  const result = schema.safeParse('not-a-url');
  assert.strictEqual(result.success, false);
});

test('Webhook URL Schema - Development mode - accepts HTTP URLs', () => {
  const schema = createWebhookUrlSchema('development');
  const result = schema.safeParse('http://example.com/webhook');
  assert.strictEqual(result.success, true);
});

test('Webhook URL Schema - Development mode - accepts HTTPS URLs', () => {
  const schema = createWebhookUrlSchema('development');
  const result = schema.safeParse('https://example.com/webhook');
  assert.strictEqual(result.success, true);
});

test('Webhook URL Schema - Development mode - rejects invalid URLs', () => {
  const schema = createWebhookUrlSchema('development');
  const result = schema.safeParse('not-a-url');
  assert.strictEqual(result.success, false);
});

test('CORS Origins Schema - Production mode - rejects wildcard origin (*)', () => {
  const schema = createCorsOriginsSchema('production');
  const result = schema.safeParse(['*']);
  assert.strictEqual(result.success, false);
});

test('CORS Origins Schema - Production mode - rejects HTTP origins', () => {
  const schema = createCorsOriginsSchema('production');
  const result = schema.safeParse(['http://example.com']);
  assert.strictEqual(result.success, false);
});

test('CORS Origins Schema - Production mode - accepts HTTPS origins', () => {
  const schema = createCorsOriginsSchema('production');
  const result = schema.safeParse(['https://example.com']);
  assert.strictEqual(result.success, true);
});

test('CORS Origins Schema - Development mode - accepts wildcard origin (*)', () => {
  const schema = createCorsOriginsSchema('development');
  const result = schema.safeParse(['*']);
  assert.strictEqual(result.success, true);
});

test('CORS Origins Schema - Development mode - accepts HTTP origins', () => {
  const schema = createCorsOriginsSchema('development');
  const result = schema.safeParse(['http://example.com']);
  assert.strictEqual(result.success, true);
});

test('CORS Origins Schema - Development mode - accepts HTTPS origins', () => {
  const schema = createCorsOriginsSchema('development');
  const result = schema.safeParse(['https://example.com']);
  assert.strictEqual(result.success, true);
});
