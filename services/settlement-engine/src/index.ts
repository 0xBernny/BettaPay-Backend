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
import * as promClient from 'prom-client';
import * as crypto from 'crypto';
import { Queue, Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import BigNumber from 'bignumber.js';
import { createWebhookQueue, createWebhookWorker } from '@bettapay/webhook-delivery';
import { computeSettlementAmounts } from './settlement-amounts.js';
import { acquireSemaphore, releaseSemaphore, getActiveCount } from './redis-semaphore.js';
import { closeWorkerWithTimeout, trackActiveJob } from './worker-shutdown.js';
import {
  validateEnvOrExit,
  CreateSettlementBody,
  BulkSettlementBody,
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
  createRedisClient,
  waitForRedis,
  startRedisMemoryMonitor,
  startMetricsServer,
  runStartupChecks,
} from "@bettapay/validation";
import type { PaginatedResponse, ApiResponse } from '@bettapay/shared-types';



const env = validateEnvOrExit(process.env);
const PORT = Number(process.env.PORT ?? '3001');
const startTime = Date.now();
const SERVICE_VERSION = readServiceVersion(import.meta.url);

const pool = new pg.Pool({
  connectionString: buildPrismaConnectionUrl(env.DATABASE_URL, env.DATABASE_POOL_SIZE, env.DATABASE_POOL_TIMEOUT),
  max: env.DATABASE_POOL_SIZE,
  connectionTimeoutMillis: env.DATABASE_POOL_TIMEOUT * 1000,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: getPrismaLogLevels() });

type SettlementJobData = {
  id: string;
  merchantId: string;
  grossAmount: string;
  asset: string;
  traceId?: string;
};

type SettlementRecord = NonNullable<Awaited<ReturnType<typeof prisma.settlement.findUnique>>>;

const fastify = Fastify({
  logger: createLoggerOptions({ level: env.LOG_LEVEL }),
  // Explicitly set body limit to 1MB (Fastify's default)
  bodyLimit: 1_048_576,
});

registerRequestId(fastify);
setupPrismaQueryLogging(prisma, fastify.log);

// #386 — exponential backoff retry strategy
const redis = createRedisClient(env.REDIS_URL, fastify.log);

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

// #386 — BullMQ connection also uses exponential backoff
const redisConnection = new URL(env.REDIS_URL);
const connectionParams = {
  host: redisConnection.hostname,
  port: parseInt(redisConnection.port || '6379', 10),
  maxRetriesPerRequest: env.REDIS_MAX_RETRIES,
  enableReadyCheck: false,
  retryStrategy: (attempt: number) => {
    const delay = Math.min(Math.pow(2, attempt) * 100, 5_000);
    fastify.log.warn({ attempt, delayMs: delay }, 'BullMQ Redis connection retry');
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
const getActiveWebhookJob = trackActiveJob(webhookWorker);

// ── Metrics ─────────────────────────────────────────────────────────────────
const feeFallbackCounter = new promClient.Counter({
  name: 'settlement_fee_fallback_total',
  help: 'Total number of times fee resolution fell back to the default rate due to malformed settings',
  labelNames: ['merchant_id'],
});

const settlementDelayCounter = new promClient.Counter({
  name: 'settlement_semaphore_delay_total',
  help: 'Total number of settlements delayed due to per-merchant concurrency limit',
  labelNames: ['merchant_id'],
});

// Served on its own port (see startMetricsServer below), not on the
// application port — keeps the scrape endpoint unauthenticated without
// exposing it alongside application traffic.
const metricsServer = startMetricsServer({
  appPort: PORT,
  contentType: promClient.register.contentType,
  getMetrics: () => promClient.register.metrics(),
  log: fastify.log,
});

// ── Database & Redis Setup ───────────────────────────────────────────────────────

const worker = new Worker('settlements', async job => {
  const settlementId = job.data.id;
  const merchantId = job.data.merchantId;
  const traceId = job.data.traceId;

  const log = traceId
    ? fastify.log.child({ traceId })
    : fastify.log;

  if (job.attemptsMade > 0) {
    log.warn({
      jobId: job.id,
      attempt: job.attemptsMade + 1,
      maxAttempts: 3,
      settlementId,
    }, 'Retrying settlement job');
  }

  // ── Per-merchant concurrency semaphore ──────────────────────────────────────
  const maxRetries = 3;
  const requeueDelayMs = 5000;
  let acquired = false;

  log.info({
    jobId: job.id,
    merchantId,
    amount: job.data.grossAmount,
    asset: job.data.asset,
    jobName: job.name,
  }, 'Processing settlement job');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    acquired = await acquireSemaphore(redis, merchantId);
    if (acquired) break;

    if (attempt < maxRetries) {
      log.info({
        merchantId,
        settlementId,
        attempt: attempt + 1,
        maxRetries,
      }, 'Settlement delayed: merchant at concurrency limit, re-queuing');

      settlementDelayCounter.inc({ merchant_id: merchantId });

      await settlementQueue.add('process-settlement', job.data, {
        delay: requeueDelayMs,
        attempts: job.opts.attempts,
        backoff: job.opts.backoff,
      });
      return;
    }

    log.error({
      merchantId,
      settlementId,
    }, 'Settlement failed: merchant concurrency limit exceeded after max retries');
    throw new Error(`Merchant ${merchantId} at concurrency limit after ${maxRetries} retries`);
  }

  try {
    // In a real app this interacts with Soroban; here we mark completed.
    const updatedSettlement = await prisma.settlement.update({
      where: { id: settlementId },
      data: { status: 'completed', completedAt: new Date() },
    });

    log.info({ settlementId }, 'Settlement completed in database');

    if (updatedSettlement.webhookUrl) {
      await webhookQueue.add('deliver', {
        url: updatedSettlement.webhookUrl,
        event: { event: 'settlement.completed', data: updatedSettlement as unknown as Record<string, unknown> },
      });
    }
  } catch (error) {
    log.error({ error, settlementId }, 'Settlement processing failed');

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
        log.error({ err, settlementId }, 'Failed to enqueue failure webhook');
      });
    }

    throw error;
  } finally {
    if (acquired) {
      await releaseSemaphore(redis, merchantId).catch(() => {});
    }
  }
}, {
  connection: connectionParams,
  concurrency: 5,
});

const getActiveSettlementJob = trackActiveJob(worker);

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
    getQueueIsPaused: () => settlementQueue.isPaused(),
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

// Signs a minimal HS256 JWT using Node's native crypto
function signHS256(payload: object, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const base64UrlEncode = (obj: object) => 
    Buffer.from(JSON.stringify(obj))
      .toString('base64url');
  
  const tokenInput = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(tokenInput)
    .digest('base64url');
  
  return `${tokenInput}.${signature}`;
}

fastify.get<{ Querystring: ReconcileQuery }>('/api/settlements/reconcile', async (request, reply) => {
  try {
    const { merchantId, from, to } = request.query;

    const localWhere: any = {};
    if (merchantId) {
      localWhere.merchantId = merchantId;
    }
    if (from || to) {
      localWhere.initiatedAt = {};
      if (from) {
        localWhere.initiatedAt.gte = new Date(from);
      }
      if (to) {
        localWhere.initiatedAt.lte = new Date(to);
      }
    }

    // 1. Query local settlements
    const localRecords = await prisma.settlement.findMany({
      where: localWhere,
      orderBy: { initiatedAt: 'desc' },
    });

    // 2. Fetch api-gateway records via HTTP call
    const gatewayUrl = process.env.API_GATEWAY_URL || 'http://localhost:3000';
    const url = new URL(`${gatewayUrl}/api/settlements`);
    if (merchantId) url.searchParams.append('merchantId', merchantId);
    if (from) url.searchParams.append('from', from);
    if (to) url.searchParams.append('to', to);

    const jwtPayload = {
      sub: 'settlement-engine-reconciler',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60, // 1 minute expiration
    };
    const token = signHS256(jwtPayload, env.JWT_SECRET);

    let gatewayRecords: any[] = [];
    try {
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API Gateway returned status ${response.status}`);
      }

      const data = await response.json() as { data: any[] };
      gatewayRecords = data.data;
    } catch (error) {
      fastify.log.error({ error }, 'Failed to fetch settlements from API Gateway');
      return reply.code(502).send({
        error: { code: 'UPSTREAM_ERROR', message: 'Failed to fetch settlement records from api-gateway', details: error instanceof Error ? error.message : String(error) }
      });
    }

    // 3. Diff the two sets by settlement ID and compare records
    const localMap = new Map<string, SettlementRecord>();
    for (const r of localRecords) {
      localMap.set(r.id, r);
    }

    const gatewayMap = new Map<string, any>();
    for (const r of gatewayRecords) {
      gatewayMap.set(r.id, r);
    }

    const matchedIds = new Set<string>();
    const missing: any[] = []; // In gateway, but missing in local
    const extra: any[] = [];   // In local, but missing in gateway
    const mismatched: any[] = []; // In both, but fields differ

    let localGrossTotal = new BigNumber(0);
    let localFeeTotal = new BigNumber(0);
    let localNetTotal = new BigNumber(0);

    let gatewayGrossTotal = new BigNumber(0);
    let gatewayFeeTotal = new BigNumber(0);
    let gatewayNetTotal = new BigNumber(0);

    const parseBN = (val: any) => {
      const bn = new BigNumber(val ?? 0);
      return bn.isFinite() ? bn : new BigNumber(0);
    };

    // Process local records
    for (const localRec of localRecords) {
      localGrossTotal = localGrossTotal.plus(parseBN(localRec.grossAmount || localRec.totalAmount));
      localFeeTotal = localFeeTotal.plus(parseBN(localRec.feeAmount));
      localNetTotal = localNetTotal.plus(parseBN(localRec.netAmount));

      if (!gatewayMap.has(localRec.id)) {
        extra.push(localRec);
      }
    }

    // Process gateway records
    for (const gatewayRec of gatewayRecords) {
      gatewayGrossTotal = gatewayGrossTotal.plus(parseBN(gatewayRec.grossAmount || gatewayRec.totalAmount));
      gatewayFeeTotal = gatewayFeeTotal.plus(parseBN(gatewayRec.feeAmount));
      gatewayNetTotal = gatewayNetTotal.plus(parseBN(gatewayRec.netAmount));

      if (!localMap.has(gatewayRec.id)) {
        missing.push(gatewayRec);
      } else {
        matchedIds.add(gatewayRec.id);
      }
    }

    // Check mismatches
    for (const id of matchedIds) {
      const localRec = localMap.get(id)!;
      const gatewayRec = gatewayMap.get(id);

      const diffFields: string[] = [];
      const fieldsToCompare = ['merchantId', 'totalAmount', 'grossAmount', 'feeAmount', 'netAmount', 'feeBps', 'asset', 'status'];
      
      for (const field of fieldsToCompare) {
        const localVal = String((localRec as any)[field] ?? '');
        const gatewayVal = String(gatewayRec[field] ?? '');
        if (localVal !== gatewayVal) {
          diffFields.push(field);
        }
      }

      if (diffFields.length > 0) {
        mismatched.push({
          id,
          local: {
            merchantId: localRec.merchantId,
            totalAmount: localRec.totalAmount,
            grossAmount: localRec.grossAmount,
            feeAmount: localRec.feeAmount,
            netAmount: localRec.netAmount,
            feeBps: localRec.feeBps,
            asset: localRec.asset,
            status: localRec.status,
          },
          gateway: {
            merchantId: gatewayRec.merchantId,
            totalAmount: gatewayRec.totalAmount,
            grossAmount: gatewayRec.grossAmount,
            feeAmount: gatewayRec.feeAmount,
            netAmount: gatewayRec.netAmount,
            feeBps: gatewayRec.feeBps,
            asset: gatewayRec.asset,
            status: gatewayRec.status,
          },
          diff: diffFields,
        });
      }
    }

    const matchedCount = matchedIds.size - mismatched.length;

    return {
      matched: matchedCount,
      missing,
      extra,
      mismatches: mismatched,
      counts: {
        local: localRecords.length,
        gateway: gatewayRecords.length,
        matched: matchedCount,
        missing: missing.length,
        extra: extra.length,
        mismatched: mismatched.length,
      },
      totals: {
        local: {
          gross: localGrossTotal.toString(),
          fee: localFeeTotal.toString(),
          net: localNetTotal.toString(),
        },
        gateway: {
          gross: gatewayGrossTotal.toString(),
          fee: gatewayFeeTotal.toString(),
          net: gatewayNetTotal.toString(),
        },
      }
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
    let feeBps = env.FEES_DEFAULT_BPS;
    if (parsedFeeRule.success) {
      feeBps = parsedFeeRule.data.feeBps;
    } else {
      feeFallbackCounter.inc({ merchant_id: d.merchantId });
      fastify.log.warn({
        merchantId: d.merchantId,
        rawSettings: merchant?.settings,
        issues: parsedFeeRule.error?.issues
      }, '[Settlement] FeeRule parsing failed, falling back to FEES_DEFAULT_BPS');
    }
    const webhookUrl = parsedFeeRule.success ? (parsedFeeRule.data as Record<string, unknown>).webhookUrl as string ?? null : null;

    const { grossAmount, feeAmount, netAmount, feeSnapshot } = computeSettlementAmounts(d.amount, feeBps);

    const rawIdempotencyKey = request.headers['idempotency-key'];
    const idempotencyKey = Array.isArray(rawIdempotencyKey) ? rawIdempotencyKey[0] : rawIdempotencyKey;

    const settlementId = 'set_' + crypto.randomUUID().replace(/-/g, '');

    if (idempotencyKey) {
      let claimed: string | null = null;
      try {
        claimed = await redis.set(`idempotency:${idempotencyKey}`, settlementId, 'EX', 86400, 'NX');
      } catch {
        // Redis unavailable — fall through to DB @unique constraint
      }

      if (claimed === null) {
        // Another request atomically claimed this idempotency key first
        const existingId = await redis.get(`idempotency:${idempotencyKey}`).catch(() => null);
        if (existingId) {
          const existingSettlement = await prisma.settlement.findUnique({
            where: { id: existingId },
          });
          if (existingSettlement) {
            return reply.code(200).send({ data: existingSettlement });
          }
        }
      }
    }

    const settlement = await prisma.settlement.create({
      data: {
        id: settlementId,
        merchantId: d.merchantId,
        totalAmount: grossAmount,
        grossAmount,
        feeAmount,
        netAmount,
        feeBps,
        asset: d.asset,
        status: 'pending',
        webhookUrl,
        feeSnapshot,
        idempotencyKey: idempotencyKey ?? undefined,
        idempotencyKeyExpiresAt: idempotencyKey ? new Date(Date.now() + 86400_000) : undefined,
      },
    });

    const traceId = (request as unknown as { traceId?: string }).traceId;

    const jobData: SettlementJobData = {
      id: settlement.id,
      merchantId: settlement.merchantId,
      grossAmount: settlement.grossAmount,
      asset: settlement.asset,
      traceId,
    };

    await settlementQueue.add('process-settlement', jobData);

    return reply.code(201).send({ data: settlement });
});

fastify.post<{ Body: z.infer<typeof BulkSettlementBody> }>(
  '/api/settlements/bulk',
  {
    config: {
      rateLimit: {
        max: 30,
        timeWindow: 60 * 1000,
      },
    },
  },
  async (request, reply) => {
    const d = BulkSettlementBody.parse(request.body);

    if (d.settlements.length > 100) {
      return reply.code(400).send(createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Batch size exceeds maximum limit of 100 settlements'));
    }

    const merchant = await prisma.merchant.findUnique({ where: { id: d.merchantId } });
    if (!merchant) {
      return reply.code(404).send(createErrorResponse(ErrorCodes.NOT_FOUND, 'Merchant not found'));
    }

    const settings = merchant.settings as {
      webhookUrl?: string;
      minSettlementAmount?: string;
      maxSettlementAmount?: string;
      dailySettlementLimit?: string;
    } | null | undefined;

    const parsedFeeRule = FeeRule.passthrough().safeParse(merchant?.settings);
    const feeBps = parsedFeeRule.success ? parsedFeeRule.data.feeBps : env.FEES_DEFAULT_BPS;
    const webhookUrl = parsedFeeRule.success ? (parsedFeeRule.data as Record<string, unknown>).webhookUrl as string ?? null : null;

    // Fetch current daily total
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const aggregateResult = await prisma.$queryRaw<[{ sum: string | null }]>`
      SELECT COALESCE(SUM(CAST("totalAmount" AS DECIMAL)), 0)::text as sum
      FROM "Settlement"
      WHERE "merchantId" = ${d.merchantId}
      AND "initiatedAt" >= ${todayStart}
    `;

    const currentDailyTotal = aggregateResult?.[0]?.sum ? parseFloat(aggregateResult[0].sum) : 0;

    let runningBatchTotal = 0;
    const validItems: Array<{ amount: string; asset: string; id: string; grossAmount: string; feeAmount: string; netAmount: string }> = [];
    const errors: Array<{ index: number; reason: string }> = [];

    for (let i = 0; i < d.settlements.length; i++) {
      const item = d.settlements[i];
      const amount = parseFloat(item.amount);

      if (isNaN(amount) || amount <= 0) {
        errors.push({ index: i, reason: 'amount must be greater than zero' });
        continue;
      }

      // Check min/max amount limits
      if (settings?.minSettlementAmount) {
        const minAmount = parseFloat(settings.minSettlementAmount);
        if (amount < minAmount) {
          errors.push({
            index: i,
            reason: `Settlement amount ${item.amount} is below minimum ${settings.minSettlementAmount}`
          });
          continue;
        }
      }

      if (settings?.maxSettlementAmount) {
        const maxAmount = parseFloat(settings.maxSettlementAmount);
        if (amount > maxAmount) {
          errors.push({
            index: i,
            reason: `Settlement amount ${item.amount} exceeds maximum ${settings.maxSettlementAmount}`
          });
          continue;
        }
      }

      // Check daily settlement limits
      if (settings?.dailySettlementLimit) {
        const dailyLimit = parseFloat(settings.dailySettlementLimit);
        if (currentDailyTotal + runningBatchTotal + amount > dailyLimit) {
          errors.push({
            index: i,
            reason: `Daily settlement limit exceeded. Current: ${currentDailyTotal + runningBatchTotal}, Requested: ${amount}, Limit: ${settings.dailySettlementLimit}`
          });
          continue;
        }
      }

      const { grossAmount, feeAmount, netAmount } = computeSettlementAmounts(item.amount, feeBps);
      const settlementId = 'set_' + crypto.randomUUID().replace(/-/g, '');

      validItems.push({
        id: settlementId,
        amount: item.amount,
        asset: item.asset,
        grossAmount,
        feeAmount,
        netAmount
      });
      runningBatchTotal += amount;
    }

    const batchId = 'batch_' + crypto.randomUUID().replace(/-/g, '');

    if (validItems.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const item of validItems) {
          await tx.settlement.create({
            data: {
              id: item.id,
              merchantId: d.merchantId,
              totalAmount: item.grossAmount,
              grossAmount: item.grossAmount,
              feeAmount: item.feeAmount,
              netAmount: item.netAmount,
              feeBps,
              asset: item.asset,
              status: 'pending',
              webhookUrl,
              batchId,
            },
          });
        }
      });

      // Enqueue job for each successfully created settlement record
      for (const item of validItems) {
        const jobData: SettlementJobData = {
          id: item.id,
          merchantId: d.merchantId,
          grossAmount: item.grossAmount,
          asset: item.asset,
        };
        await settlementQueue.add('process-settlement', jobData).catch((err) => {
          request.log.error({ err, settlementId: item.id }, 'Failed to enqueue bulk settlement job');
        });
      }
    }

    return reply.code(201).send({
      data: {
        batchId,
        total: d.settlements.length,
        created: validItems.length,
        errors,
      },
    });
  }
);

fastify.get<{ Params: { batchId: string } }>(
  '/api/settlements/batch/:batchId/status',
  {
    config: {
      rateLimit: {
        max: 60,
        timeWindow: 60 * 1000,
      },
    },
  },
  async (request, reply) => {
    const { batchId } = request.params;

    if (!batchId || !batchId.startsWith('batch_')) {
      return reply.code(400).send(createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid batchId format'));
    }

    const settlements = await prisma.settlement.findMany({
      where: { batchId },
    });

    if (settlements.length === 0) {
      return reply.code(404).send(createErrorResponse(ErrorCodes.NOT_FOUND, `Batch ${batchId} not found`));
    }

    const total = settlements.length;
    let pending = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;

    for (const s of settlements) {
      if (s.status === 'pending') pending++;
      else if (s.status === 'processing') processing++;
      else if (s.status === 'completed') completed++;
      else if (s.status === 'failed') failed++;
    }

    let overallStatus = 'processing';
    if (completed === total) overallStatus = 'completed';
    else if (failed === total) overallStatus = 'failed';
    else if (pending === total) overallStatus = 'pending';

    return {
      data: {
        batchId,
        total,
        pending,
        processing,
        completed,
        failed,
        status: overallStatus,
      },
    };
  }
);



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

    // 1b. Close the metrics server
    await new Promise<void>((resolve) => metricsServer.close(() => resolve()));

    // 2. Close BullMQ worker (drain and close gracefully, force-stop after 10s)
    fastify.log.info('Closing BullMQ worker...');
    await closeWorkerWithTimeout(worker, 'settlements', fastify.log, getActiveSettlementJob);
    fastify.log.info('BullMQ worker closed');

    // 3. Close BullMQ queues
    fastify.log.info('Closing BullMQ queues...');
    await settlementQueue.close();
    await settlementDLQ.close();
    await closeWorkerWithTimeout(webhookWorker, 'settlement-webhooks', fastify.log, getActiveWebhookJob);
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
    await runStartupChecks({
      service: 'settlement-engine',
      version: SERVICE_VERSION,
      logger: fastify.log,
      checks: [
        {
          name: 'prisma',
          fn: () => connectWithRetry(prisma, fastify.log),
          critical: true,
        },
        {
          name: 'redis',
          fn: () => waitForRedis(redis, fastify.log),
          critical: true,
        },
        {
          name: 'bullmq',
          fn: async () => {
            const counts = await settlementQueue.getJobCounts();
            fastify.log.info({ counts }, 'BullMQ queue reachable');
          },
          critical: false,
        },
      ],
    });

    // #387 — Redis memory monitoring
    startRedisMemoryMonitor(redis, fastify.log);

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info({ port: PORT }, 'Settlement Engine started successfully');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

export { fastify, prisma, settlementQueue };

const isDirectRun = 
  !process.argv[1] || 
  process.argv[1].endsWith('index.ts') || 
  process.argv[1].endsWith('index.js') ||
  process.argv[1].endsWith('dist/index.js');

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  start();
}