import test from 'tape';
import Fastify from 'fastify';
import { sanitizeParamString, sanitizeParamsValue } from './index.js';

// ── Unit Tests: sanitizeParamString & sanitizeParamsValue ─────────────────────

test('sanitizeParamString: removes null bytes, newlines, carriage returns, and control chars', (t) => {
  t.equal(sanitizeParamString('abc\x00\n\rtest'), 'abctest');
  t.equal(sanitizeParamString('\x01\x02query\x1F'), 'query');
  t.equal(sanitizeParamString('\x7Ftest\x7F'), 'test');
  t.end();
});

test('sanitizeParamString: preserves horizontal tabs (\\t)', (t) => {
  t.equal(sanitizeParamString('hello\tworld'), 'hello\tworld');
  t.equal(sanitizeParamString('\tpreserved\t'), '\tpreserved\t');
  t.end();
});

test('sanitizeParamString: leaves valid strings unchanged', (t) => {
  t.equal(sanitizeParamString('valid_merchant_id_123'), 'valid_merchant_id_123');
  t.equal(sanitizeParamString('search-query-123!@#$'), 'search-query-123!@#$');
  t.end();
});

test('sanitizeParamsValue: recursively sanitizes strings in objects and arrays', (t) => {
  const input = {
    param1: 'clean\x00data\n',
    nested: {
      field: 'nested\rval\x01',
      list: ['item1\x02', 'item2\tvalid', 123, true, null],
    },
    num: 42,
    bool: false,
  };

  const output = sanitizeParamsValue(input) as typeof input;

  t.equal(output.param1, 'cleandata');
  t.equal(output.nested.field, 'nestedval');
  t.equal(output.nested.list[0], 'item1');
  t.equal(output.nested.list[1], 'item2\tvalid');
  t.equal(output.nested.list[2], 123);
  t.equal(output.nested.list[3], true);
  t.equal(output.nested.list[4], null);
  t.equal(output.num, 42);
  t.equal(output.bool, false);
  t.end();
});

// ── Fastify preHandler Hook Integration Test ──────────────────────────────────

test('preHandler hook: sanitizes query and path parameters on incoming Fastify requests', async (t) => {
  const fastify = Fastify();

  fastify.addHook('preHandler', async (request) => {
    if (request.query && typeof request.query === 'object') {
      sanitizeParamsValue(request.query);
    }
    if (request.params && typeof request.params === 'object') {
      sanitizeParamsValue(request.params);
    }
  });

  let capturedQuery: any = null;
  let capturedParams: any = null;

  fastify.get('/test-route/:id', async (request) => {
    capturedQuery = request.query;
    capturedParams = request.params;
    return { status: 'ok' };
  });

  const res = await fastify.inject({
    method: 'GET',
    url: `/test-route/${encodeURIComponent('id123\x00\n\r')}?status=${encodeURIComponent('pending\n\x00\r')}&tab=${encodeURIComponent('tag\tval')}`,
  });

  t.equal(res.statusCode, 200);
  t.equal(capturedParams.id, 'id123', 'Path param control characters stripped');
  t.equal(capturedQuery.status, 'pending', 'Query param control characters stripped');
  t.equal(capturedQuery.tab, 'tag\tval', 'Horizontal tab in query param preserved');
  await fastify.close();
  t.end();
});
