/**
 * Indexer Service — BettaPay Backend
 *
 * Listens to Soroban contract event streams and indexes payment/settlement events.
 * Polls the Stellar RPC for contract events on the SETTLEMENT_CONTRACT_ID.
 *
 * Endpoints:
 *   GET /api/events              — list indexed events (newest first, max 50)
 *   GET /api/health              — liveness probe
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import crypto from 'crypto';
import { rpc } from '@stellar/stellar-sdk';
import { validateEnv } from '@bettapay/validation';

export const env = validateEnv(process.env);
const PORT = Number(process.env.PORT ?? '3003');

export const fastify = Fastify({ logger: true });

fastify.register(cors, { 
  origin: env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) 
});

// In-memory event ring buffer (50 events max)
export const events: any[] = [];
let latestLedgerCursor: number | undefined = undefined;

function pushEvent(topic: string, contractId: string, data: Record<string, unknown>, ledger: number) {
  const event = {
    id: 'evt_' + crypto.randomUUID().replace(/-/g, ''),
    contractId,
    topic,
    ...data,
    ledger,
    indexedAt: new Date().toISOString(),
  };
  events.unshift(event);
  if (events.length > 50) events.pop();
  fastify.log.info(`[Indexer] ${topic} — ${event.id} (Ledger ${ledger})`);
  return event;
}

// HTTP API
fastify.get('/api/health', async (request, reply) => {
  return { status: 'ok', indexedEvents: events.length, latestLedgerCursor };
});

fastify.get('/api/events', async (request, reply) => {
  return { events, total: events.length, latestLedgerCursor };
});

const server = new rpc.Server(env.STELLAR_RPC_URL, { allowHttp: true });

async function pollEvents() {
  try {
    if (!latestLedgerCursor) {
      const latest = await server.getLatestLedger();
      latestLedgerCursor = latest.sequence;
    }

    const request = {
      startLedger: latestLedgerCursor,
      filters: [
        {
          type: 'contract' as const,
          contractIds: [env.SETTLEMENT_CONTRACT_ID],
          topics: [],
        }
      ],
      limit: 100,
    };

    const response = await server.getEvents(request);

    if (response.events && response.events.length > 0) {
      for (const evt of response.events) {
        // Simple mapping of topics for this demo.
        // In production, decode XDR values properly.
        pushEvent(
          evt.topic.join(','),
          evt.contractId ? evt.contractId.toString() : 'unknown',
          { rawValue: evt.value.toXDR('base64') },
          evt.ledger
        );
        latestLedgerCursor = Math.max(latestLedgerCursor, evt.ledger + 1);
      }
    } else {
      // If no events, just advance cursor by querying latest ledger
      const latest = await server.getLatestLedger();
      latestLedgerCursor = Math.max(latestLedgerCursor, latest.sequence);
    }
  } catch (err) {
    fastify.log.error(`[Indexer] Polling error: ${err}`);
  } finally {
    setTimeout(pollEvents, 5000);
  }
}

export function cleanupOldEvents(): number {
  const retentionDays = env.EVENT_RETENTION_DAYS;
  if (retentionDays <= 0) {
    return 0;
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  let totalDeleted = 0;
  const batchSize = 1000;

  while (true) {
    const toDeleteIndices: number[] = [];
    for (let i = 0; i < events.length; i++) {
      const indexedAt = events[i].indexedAt;
      if (indexedAt) {
        const date = new Date(indexedAt);
        if (!isNaN(date.getTime()) && date < cutoff) {
          toDeleteIndices.push(i);
          if (toDeleteIndices.length === batchSize) {
            break;
          }
        }
      }
    }

    if (toDeleteIndices.length === 0) {
      break;
    }

    // Delete matching records from the events array (back to front to preserve correct indices during deletion)
    for (let i = toDeleteIndices.length - 1; i >= 0; i--) {
      events.splice(toDeleteIndices[i], 1);
    }

    totalDeleted += toDeleteIndices.length;
  }

  return totalDeleted;
}

export function runCleanupJob(): void {
  try {
    const deletedCount = cleanupOldEvents();
    fastify.log.info({
      retentionDays: env.EVENT_RETENTION_DAYS,
      deletedCount,
      status: 'success'
    }, `[Indexer] Event retention cleanup completed. Retention period: ${env.EVENT_RETENTION_DAYS} days. Deleted: ${deletedCount} events. Status: success`);
  } catch (error: any) {
    fastify.log.error({
      retentionDays: env.EVENT_RETENTION_DAYS,
      error: error?.message || error,
      status: 'failed'
    }, `[Indexer] Event retention cleanup failed. Retention period: ${env.EVENT_RETENTION_DAYS} days. Error: ${error}. Status: failed`);
  }
}

let cleanupInterval: NodeJS.Timeout | undefined = undefined;

export function startCleanupScheduler() {
  if (env.EVENT_RETENTION_DAYS > 0) {
    // Run once during startup
    runCleanupJob();
    // Schedule every 24 hours
    cleanupInterval = setInterval(runCleanupJob, 24 * 60 * 60 * 1000);
  }
}

export function stopCleanupScheduler() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = undefined;
  }
}

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info('[Indexer] Starting Stellar RPC polling loop...');
    pollEvents();
    startCleanupScheduler();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test') {
  start();
}
