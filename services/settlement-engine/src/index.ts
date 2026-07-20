/**
 * Settlement Engine — BettaPay Backend
 *
 * Handles settlement processing with fee deduction and audit trail.
 *
 * Endpoints:
 *   GET  /api/health              — dependency and upstream health probe
 *   GET  /api/settlements         — list settlements (paginated)
 *   POST /api/settlements         — create and process a settlement
 *
 * Precision strategy
 * ──────────────────
 * All monetary arithmetic uses BigNumber.js (ROUND_DOWN, no floating-point).
 * Fee basis points are applied as:
 *   feeAmount  = floor(grossAmount × feeBps / 10 000, asset decimals)
 *   netAmount  = grossAmount − feeAmount
 *
 * All three amounts (grossAmount, feeAmount, netAmount) are stored as
 * decimal strings so the database never loses sub-cent precision for
 * assets like USDC (6 dp) or XLM (7 dp).
 */

import Fastify from 'fastify';
import { z } from 'zod';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import * as crypto from 'crypto';
import { Redis } from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import BigNumber from 'bignumber.js';
import { createWebhookQueue, createWebhookWorker } from '@bettapay/webhook-delivery';
import { computeSettlementAmounts } from './settlement-amounts.js';
import {
  validateEnv,
  CreateSettlementBody,
  registerErrorHandler,
  registerRequestId,
  createErrorResponse,
  ErrorCodes,
  FeeRule,
  SettlementListQuery,
  getPrismaLogLevels,
  setupPrismaQueryLogging,
  buildPrismaConnectionUrl,
  connectWithRetry,
  createLoggerOptions,
  registerTracing,
  buildSettlementEngineHealthResponse,
  readServiceVersion,
} from "@bettapay/validation";
import type { PaginatedResponse, ApiResponse } from '@bettapay/shared-types';



const env = validateEnv(process.env);
const PORT = Number(process.env.PORT ?? '3001');
const startTime = Date.now();
const SERVICE_VERSION = readServiceVersion(import.meta.url);

process.env.DATABASE_URL = buildPrismaConnectionUrl(
  env.DATABASE_URL,
  env.DATABASE_POOL_SIZE,
  env.DATABASE_POOL_TIMEOUT,
);
const prisma = new PrismaClient({ log: getPrismaLogLevels() });

type SettlementJobData = {
  id: string;
  merchantId: string;
  grossAmount: string;
  asset: string;
};

type SettlementRecord = NonNullable<Awaited<ReturnType<typeof prisma.settlement.findUnique>>>;

const fastify = Fastify({
  logger: createLoggerOptions({ level: env.LOG_LEVEL }),
  // Explicitly set body limit to 1MB (Fastify's default)
  bodyLimit: 1_048_576,
});

registerRequestId(fastify);
setupPrismaQueryLogging(prisma, fastify.log);

const redis = new Redis(env.REDIS_URL);

fastify.addHook('onClose', async () => {
  await redis.quit();
});

fastify.register(cors, { 
  origin: env.ALLOWED_ORIGINS
});

fastify.register(helmet, { contentSecurityPolicy: false });

fastify.register(rateLimit, {
  global: true,
  max: 1000,
  timeWindow: 60 * 1000,
  errorResponseBuilder: (_request, context) => ({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests — rate limit is ${context.max} requests per ${context.after}`,
    },
  }),
});

registerErrorHandler(fastify);
// Distributed tracing: log + propagate x-request-id / x-trace-id (#118).
registerTracing(fastify);

const redisConnection = new URL(env.REDIS_URL);
const connectionParams = {
  host: redisConnection.hostname,
  port: parseInt(redisConnection.port || '6379', 10),
  maxRetriesPerRequest: env.REDIS_MAX_RETRIES,
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    if (times > 10) return null;
    const delay = Math.min(times * 1000, 30000);
    fastify.log.warn({ attempt: times, delay }, 'Redis connection retry');
    return delay;
  },
};

// ── Settlement processing queue ────────────────────────────────────────────────

const settlementQueue = new Queue('settlements', {
  connection: connectionParams,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});
const settlementDLQ = new Queue('settlements-dlq', { connection: connectionParams });

// ── Webhook delivery queue & worker (shared @bettapay/webhook-delivery) ───────
//
// Webhook delivery is now decoupled from the settlement worker: after updating
// the settlement status the worker enqueues a WebhookJobData onto
// 'settlement-webhooks' and returns immediately.  The shared webhookWorker
// handles retries with BullMQ's built-in exponential back-off — no in-process
// sleep loop required.
//
// Migration note: the previous sendWebhookWithRetries had no persistence, so
// there are no in-flight webhook jobs to migrate.  The queue name
// 'settlement-webhooks' is fresh.
const webhookQueue = createWebhookQueue('settlement-webhooks', connectionParams);
const webhookWorker = createWebhookWorker('settlement-webhooks', connectionParams, {
  logger: {
    info: (obj, msg) => fastify.log.info(obj, msg),
    warn: (obj, msg) => fastify.log.warn(obj, msg),
    error: (obj, msg) => fastify.log.error(obj, msg),
  },
});

// ── Settlement processor ───────────────────────────────────────────────────────

const worker = new Worker('settlements', async job => {
  const settlementId = job.data.id;

  if (job.attemptsMade > 0) {
    fastify.log.warn({
      jobId: job.id,
      attempt: job.attemptsMade + 1,
      maxAttempts: 3,
      settlementId,
    }, 'Retrying settlement job');
  }

  fastify.log.info({
    jobId: job.id,
    merchantId: job.data.merchantId,
    amount: job.data.grossAmount,
    asset: job.data.asset,
    jobName: job.name,
  }, 'Processing settlement job');

  const settlement = await prisma.settlement.findUnique({ where: { id: settlementId } });
  if (!settlement) {
    throw new Error(`Settlement ${settlementId} not found`);
  }

  // If already in a terminal state, ensure the webhook is (re-)delivered.
  if (settlement.status === 'completed' || settlement.status === 'failed') {
    fastify.log.info({ settlementId, status: settlement.status }, 'Settlement already processed, enqueuing webhook');
    if (settlement.webhookUrl) {
      await webhookQueue.add('deliver', {
        url: settlement.webhookUrl,
        event: { event: `settlement.${settlement.status}`, data: settlement as unknown as Record<string, unknown> },
      });
    }
    return;
  }

  try {
    // In a real app this interacts with Soroban; here we mark completed.
    const updatedSettlement = await prisma.settlement.update({
      where: { id: settlementId },
      data: { status: 'completed', completedAt: new Date() },
    });

    fastify.log.info({ settlementId }, 'Settlement completed in database');

    if (updatedSettlement.webhookUrl) {
      await webhookQueue.add('deliver', {
        url: updatedSettlement.webhookUrl,
        event: { event: 'settlement.completed', data: updatedSettlement as unknown as Record<string, unknown> },
      });
    }
  } catch (error) {
    fastify.log.error({ error, settlementId }, 'Settlement processing failed');

    const updatedSettlement = await prisma.settlement.update({
      where: { id: settlementId },
      data: { status: 'failed', completedAt: new Date() },
    }).catch(() => null);

    if (updatedSettlement?.webhookUrl) {
      // Best-effort enqueue — don't let a queue error mask the original failure.
      await webhookQueue.add('deliver', {
        url: updatedSettlement.webhookUrl,
        event: { event: 'settlement.failed', data: updatedSettlement as unknown as Record<string, unknown> },
      }).catch((err: unknown) => {
        fastify.log.error({ err, settlementId }, 'Failed to enqueue failure webhook');
      });
    }

    throw error;
  }
}, {
  connection: connectionParams,
  concurrency: 5,
});

worker.on('failed', async (job, err) => {
  if (job) {
    fastify.log.error({
      jobId: job.id,
      settlementId: job.data.id,
      attempt: job.attemptsMade,
      error: err.message,
    }, 'Job failed after all retries, moving to DLQ');

    await settlementDLQ.add(job.name, job.data, {
      jobId: job.id,
      attempts: 1,
    });
  }
});

settlementQueue.on('error', (err) => {
  fastify.log.error({ err: err.message }, 'BullMQ queue connection error');
});
settlementDLQ.on('error', (err) => {
  fastify.log.error({ err: err.message }, 'BullMQ DLQ connection error');
});
worker.on('error', (err) => {
  fastify.log.error({ err: err.message }, 'BullMQ worker connection error');
});
webhookQueue.on('error', (err) => {
  fastify.log.error({ err: err.message }, 'BullMQ webhook queue connection error');
});
webhookWorker.on('error', (err) => {
  fastify.log.error({ err: err.message }, 'BullMQ webhook worker connection error');
});

fastify.get('/api/health', async (_request, reply) => {
  const health = await buildSettlementEngineHealthResponse({
    queryDatabase: () => prisma.$queryRaw`SELECT 1`,
    pingRedis: () => redis.ping(),
    getQueueJobCounts: () => settlementQueue.getJobCounts(),
    startTime,
    service: 'settlement-engine',
    version: SERVICE_VERSION,
  });
  const statusCode = health.status === 'unhealthy' ? 503 : 200;
  return reply.code(statusCode).send(health);
});

fastify.get('/api/settlements', async (request, reply): Promise<PaginatedResponse<SettlementRecord>> => {
  const { limit, offset, status, from, to } = SettlementListQuery.parse(request.query ?? {});
  const where: any = {};
  if (status) where.status = status;
  if (from || to) {
    where.initiatedAt = {};
    if (from) where.initiatedAt.gte = new Date(from);
    if (to) where.initiatedAt.lte = new Date(to);
  }
  const records = await prisma.settlement.findMany({
    where,
    take: limit,
    skip: offset,
    orderBy: { initiatedAt: 'desc' },
  });
  const total = await prisma.settlement.count({ where });
  const hasMore = offset + limit < total;
  return {
    data: records,
    pagination: { total, limit, offset, hasMore }
  };
});

interface ReconcileQuery {
  merchantId?: string;
  from?: string;
  to?: string;
}

/**
 * Local Consistency Check for Settlements
 *
 * This endpoint performs internal validation of settlement records to ensure
 * data integrity. It verifies:
 * - Mathematical consistency: grossAmount - feeAmount = netAmount
 * - Fee calculation accuracy: feeAmount matches feeBps applied to grossAmount
 * - Merchant reference validity: all settlements reference existing merchants
 *
 * This is a LOCAL consistency check - it does not make external HTTP calls.
 * All validation is performed against the settlement engine's own database.
 */
fastify.get<{ Querystring: ReconcileQuery }>('/api/settlements/reconcile', async (request, reply) => {
  try {
    const { merchantId, from, to } = request.query;

    const where: Record<string, unknown> = {};
    if (merchantId) {
      where.merchantId = merchantId;
    }
    if (from || to) {
      where.initiatedAt = {};
      if (from) {
        (where.initiatedAt as Record<string, Date>).gte = new Date(from);
      }
      if (to) {
        (where.initiatedAt as Record<string, Date>).lte = new Date(to);
      }
    }

    // Query settlements from local database
    const settlements = await prisma.settlement.findMany({
      where,
      orderBy: { initiatedAt: 'desc' },
    });

    // Get all unique merchant IDs and verify they exist
    const merchantIds = [...new Set(settlements.map(s => s.merchantId))];
    const existingMerchants = await prisma.merchant.findMany({
      where: { id: { in: merchantIds } },
      select: { id: true },
    });
    const existingMerchantIds = new Set(existingMerchants.map(m => m.id));

    const parseBN = (val: unknown): BigNumber => {
      const bn = new BigNumber(val as string ?? 0);
      return bn.isFinite() ? bn : new BigNumber(0);
    };

    const inconsistencies: Array<{
      settlementId: string;
      type: 'amount_mismatch' | 'fee_calculation' | 'missing_merchant';
      details: Record<string, unknown>;
    }> = [];

    let totalGross = new BigNumber(0);
    let totalFee = new BigNumber(0);
    let totalNet = new BigNumber(0);
    let validCount = 0;

    const statusCounts: Record<string, number> = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    for (const settlement of settlements) {
      const gross = parseBN(settlement.grossAmount);
      const fee = parseBN(settlement.feeAmount);
      const net = parseBN(settlement.netAmount);

      totalGross = totalGross.plus(gross);
      totalFee = totalFee.plus(fee);
      totalNet = totalNet.plus(net);

      statusCounts[settlement.status] = (statusCounts[settlement.status] || 0) + 1;

      // Check 1: Verify grossAmount - feeAmount = netAmount
      const expectedNet = gross.minus(fee);
      if (!expectedNet.isEqualTo(net)) {
        inconsistencies.push({
          settlementId: settlement.id,
          type: 'amount_mismatch',
          details: {
            grossAmount: settlement.grossAmount,
            feeAmount: settlement.feeAmount,
            netAmount: settlement.netAmount,
            expectedNet: expectedNet.toString(),
          },
        });
        continue;
      }

      // Check 2: Verify fee calculation matches feeBps
      // feeAmount = floor(grossAmount × feeBps / 10000)
      const expectedFee = gross.times(settlement.feeBps).dividedBy(10000).integerValue(BigNumber.ROUND_DOWN);
      // Allow for minor precision differences (within 1 unit)
      if (expectedFee.minus(fee).abs().isGreaterThan(1)) {
        inconsistencies.push({
          settlementId: settlement.id,
          type: 'fee_calculation',
          details: {
            grossAmount: settlement.grossAmount,
            feeBps: settlement.feeBps,
            actualFee: settlement.feeAmount,
            expectedFee: expectedFee.toString(),
          },
        });
        continue;
      }

      // Check 3: Verify merchant exists
      if (!existingMerchantIds.has(settlement.merchantId)) {
        inconsistencies.push({
          settlementId: settlement.id,
          type: 'missing_merchant',
          details: {
            merchantId: settlement.merchantId,
          },
        });
        continue;
      }

      validCount++;
    }

    return {
      summary: {
        total: settlements.length,
        valid: validCount,
        inconsistent: inconsistencies.length,
      },
      statusBreakdown: statusCounts,
      totals: {
        gross: totalGross.toString(),
        fee: totalFee.toString(),
        net: totalNet.toString(),
      },
      inconsistencies,
      reconciliationType: 'local_consistency_check',
    };
  } catch (error) {
    fastify.log.error({ error }, 'Reconciliation error');
    return reply.code(400).send({ error: 'Failed to perform reconciliation' });
  }
});

fastify.post<{ Body: z.infer<typeof CreateSettlementBody> }>(
  '/api/settlements',
  {
    config: {
      rateLimit: {
        max: 60,
        timeWindow: 60 * 1000,
      },
    },
  },
  async (request, reply) => {
    const d = CreateSettlementBody.parse(request.body);

    if (!d.amount || !d.asset) {
      return reply.code(400).send(createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'amount and asset are required'));
    }

    // Validate that the amount is positive without floating-point conversion
    const grossBN = new BigNumber(d.amount);
    if (!grossBN.isFinite() || grossBN.isLessThanOrEqualTo(0)) {
      return reply.code(400).send(createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'amount must be > 0'));
    }

    const merchant = await prisma.merchant.findUnique({ where: { id: d.merchantId } });
    const parsedFeeRule = FeeRule.passthrough().safeParse(merchant?.settings);
    const feeBps = parsedFeeRule.success ? parsedFeeRule.data.feeBps : env.FEES_DEFAULT_BPS;
    const webhookUrl = parsedFeeRule.success ? (parsedFeeRule.data as Record<string, unknown>).webhookUrl as string ?? null : null;

    const { grossAmount, feeAmount, netAmount } = computeSettlementAmounts(d.amount, feeBps);

    const rawIdempotencyKey = request.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(rawIdempotencyKey) ? rawIdempotencyKey[0] : rawIdempotencyKey;

    if (idempotencyKey) {
      const existingSettlementId = await redis.get(`idempotency:${idempotencyKey}`);
      if (existingSettlementId) {
        const existingSettlement = await prisma.settlement.findUnique({
          where: { id: existingSettlementId },
        });
        if (existingSettlement) {
          return reply.code(200).send(existingSettlement);
        }
      }
    }

    const settlement = await prisma.settlement.create({
      data: {
        id: 'set_' + crypto.randomUUID().replace(/-/g, ''),
        merchantId: d.merchantId,
        totalAmount: grossAmount,
        grossAmount,
        feeAmount,
        netAmount,
        feeBps,
        asset: d.asset,
        status: 'pending',
        webhookUrl,
      },
    });

    const jobData: SettlementJobData = {
      id: settlement.id,
      merchantId: settlement.merchantId,
      grossAmount: settlement.grossAmount,
      asset: settlement.asset,
    };

    await settlementQueue.add('process-settlement', jobData);

    if (idempotencyKey) {
      // 24-hour TTL (24 * 60 * 60 = 86400 seconds)
      await redis.set(`idempotency:${idempotencyKey}`, settlement.id, 'EX', 86400);
    }

    return reply.code(201).send(settlement);
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  // Prevent multiple shutdown attempts
  if (isShuttingDown) {
    fastify.log.warn({ signal }, 'Shutdown already in progress, ignoring duplicate signal');
    return;
  }
  
  isShuttingDown = true;
  fastify.log.info({ signal }, 'Received shutdown signal, starting graceful shutdown');

  // Set a timeout to force exit if shutdown hangs
  const forceExitTimeout = setTimeout(() => {
    fastify.log.error('Graceful shutdown timed out after 30 seconds, forcing exit');
    process.exit(1);
  }, 30000);

  try {
    // 1. Close Fastify server (stops accepting new connections)
    fastify.log.info('Closing Fastify server...');
    await fastify.close();
    fastify.log.info('Fastify server closed');

    // 2. Close BullMQ worker (drain and close gracefully)
    fastify.log.info('Closing BullMQ worker...');
    await worker.close();
    fastify.log.info('BullMQ worker closed');

    // 3. Close BullMQ queues
    fastify.log.info('Closing BullMQ queues...');
    await settlementQueue.close();
    await settlementDLQ.close();
    await webhookWorker.close();
    await webhookQueue.close();
    fastify.log.info('BullMQ queues closed');

    // 4. Close Redis connection
    fastify.log.info('Closing Redis connection...');
    await redis.quit();
    fastify.log.info('Redis connection closed');

    // 5. Disconnect Prisma
    fastify.log.info('Disconnecting Prisma...');
    await prisma.$disconnect();
    fastify.log.info('Prisma disconnected');

    // Clear the force exit timeout
    clearTimeout(forceExitTimeout);

    fastify.log.info({ signal }, 'Graceful shutdown completed successfully');
    process.exit(0);
  } catch (error) {
    fastify.log.error({ error, signal }, 'Error during graceful shutdown');
    clearTimeout(forceExitTimeout);
    process.exit(1);
  }
}

// Register shutdown handlers for SIGTERM and SIGINT
process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

// ============================================================================
// STARTUP
// ============================================================================

const start = async () => {
  try {
    await connectWithRetry(prisma, fastify.log);
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info({ port: PORT }, 'Settlement Engine started successfully');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();