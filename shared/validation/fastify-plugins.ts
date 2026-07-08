import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';

export function registerRequestId(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const header = request.headers['x-request-id'];
    const reqId = (Array.isArray(header) ? header[0] : header) || randomUUID();
    request.id = reqId;
    request.log = request.log.child({ requestId: reqId });
  });

  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    if (request.id) {
      reply.header('x-request-id', request.id);
    }
    return payload;
  });
}
