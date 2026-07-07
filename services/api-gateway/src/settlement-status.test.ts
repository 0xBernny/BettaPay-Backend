import test from 'tape';
import Fastify from 'fastify';
import { UpdateSettlementStatusBody } from '@bettapay/validation';

const SETTLEMENT_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ['processing'],
  processing: ['completed', 'failed'],
  completed: [],
  failed: [],
};

function buildApp(initialStatus: string) {
  const app = Fastify({ logger: false });
  const settlement: { id: string; status: string; completedAt?: string | null } | null =
    initialStatus === 'missing' ? null : { id: 'set_1', status: initialStatus, completedAt: null };

  app.patch<{ Params: { id: string }; Body: { status?: unknown } }>(
    '/api/settlements/:id/status',
    async (request, reply) => {
let d;
      try {
        d = UpdateSettlementStatusBody.parse(request.body);
      } catch {
        return reply.code(400).send({ error: 'Invalid request payload' });
      }

      if (!settlement) return reply.code(404).send({ error: 'Settlement not found' });

      const allowed = SETTLEMENT_STATUS_TRANSITIONS[settlement.status] ?? [];
      if (!allowed.includes(d.status)) {
        return reply.code(422).send({ error: 'Invalid status transition', from: settlement.status, to: d.status });
      }

      settlement.status = d.status;
      if (d.status === 'completed' || d.status === 'failed') {
        settlement.completedAt = new Date().toISOString();
      }
      return reply.send(settlement);
    }
  );

  return app;
}

async function patch(app: ReturnType<typeof buildApp>, status: unknown) {
  return app.inject({ method: 'PATCH', url: '/api/settlements/set_1/status', payload: { status } });
}

test('pending transitions to processing', async (t) => {
  const app = buildApp('pending');
  const res = await patch(app, 'processing');
  t.equal(res.statusCode, 200, 'returns 200');
  t.equal(JSON.parse(res.body).status, 'processing', 'updates to processing');
  await app.close();
  t.end();
});

test('processing transitions to completed and sets completedAt', async (t) => {
  const app = buildApp('processing');
  const res = await patch(app, 'completed');
  t.equal(res.statusCode, 200, 'returns 200');
  const body = JSON.parse(res.body);
  t.equal(body.status, 'completed', 'updates to completed');
  t.ok(body.completedAt, 'sets completedAt on terminal status');
  await app.close();
  t.end();
});

test('invalid transition returns 422', async (t) => {
  const app = buildApp('pending');
  const res = await patch(app, 'completed');
  t.equal(res.statusCode, 422, 'returns 422');
  t.equal(JSON.parse(res.body).from, 'pending', 'reports current status');
  await app.close();
  t.end();
});

test('missing settlement returns 404', async (t) => {
  const app = buildApp('missing');
  const res = await patch(app, 'processing');
  t.equal(res.statusCode, 404, 'returns 404');
  await app.close();
  t.end();
});
