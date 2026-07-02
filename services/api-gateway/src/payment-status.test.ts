import test from 'tape';
import Fastify from 'fastify';
import { UpdatePaymentStatusBody, createErrorResponse, ErrorCodes } from '@bettapay/validation';

// Mirrors the PATCH /api/payments/:id/status logic in src/index.ts, but backed by
// an in-memory store so the test does not need a database (same self-contained
// style as authenticate.test.ts).

const PAYMENT_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  initiated: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

function buildApp(initialStatus: string) {
  const app = Fastify({ logger: false });
  const payment: { id: string; status: string } | null =
    initialStatus === 'missing' ? null : { id: 'pay_1', status: initialStatus };

  app.patch<{ Params: { id: string }; Body: { status?: unknown } }>(
    '/api/payments/:id/status',
    async (request, reply) => {
      let d: UpdatePaymentStatusBody;
      try {
        d = UpdatePaymentStatusBody.parse(request.body);
      } catch {
        return reply.code(400).send(createErrorResponse(ErrorCodes.INVALID_REQUEST, 'Invalid request payload'));
      }

      if (!payment) return reply.code(404).send(createErrorResponse(ErrorCodes.NOT_FOUND, 'Payment not found'));

      const allowed = PAYMENT_STATUS_TRANSITIONS[payment.status] ?? [];
      if (!allowed.includes(d.status)) {
        return reply.code(422).send(createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid status transition', { from: payment.status, to: d.status }));
      }

      payment.status = d.status;
      return reply.send(payment);
    }
  );

  return app;
}

async function patch(app: ReturnType<typeof buildApp>, status: unknown) {
  return app.inject({ method: 'PATCH', url: '/api/payments/pay_1/status', payload: { status } });
}

test('initiated transitions to a terminal state', async (t) => {
  const app = buildApp('initiated');
  const res = await patch(app, 'completed');
  t.equal(res.statusCode, 200, 'returns 200');
  t.equal(JSON.parse(res.body).status, 'completed', 'status is updated to completed');
  await app.close();
  t.end();
});

test('terminal states cannot transition', async (t) => {
  const app = buildApp('completed');
  const res = await patch(app, 'failed');
  t.equal(res.statusCode, 422, 'returns 422 Unprocessable Entity');
  t.equal(JSON.parse(res.body).error.details.from, 'completed', 'reports the current state');
  await app.close();
  t.end();
});

test('an unaccepted status value is rejected as a bad payload', async (t) => {
  const app = buildApp('initiated');
  // `initiated` is not an accepted target, and unknown values are rejected too.
  const res = await patch(app, 'initiated');
  t.equal(res.statusCode, 400, 'returns 400 for a status outside the accepted enum');
  await app.close();
  t.end();
});

test('updating a missing payment returns 404', async (t) => {
  const app = buildApp('missing');
  const res = await patch(app, 'completed');
  t.equal(res.statusCode, 404, 'returns 404');
  await app.close();
  t.end();
});
