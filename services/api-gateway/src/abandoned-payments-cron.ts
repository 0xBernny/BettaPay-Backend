/**
 * abandoned-payments-cron.ts
 *
 * A cron job to automatically expire abandoned payments.
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyLoggerInstance } from 'fastify';

let cronInterval: NodeJS.Timeout | null = null;

/**
 * Finds payments in 'initiated' status older than the configured timeout
 * and transitions them to 'cancelled'.
 *
 * @param prisma - The Prisma client instance.
 * @param logger - The Fastify logger instance.
 * @param abandonmentHours - The number of hours after which a payment is considered abandoned.
 * @returns The number of payments that were cancelled.
 */
export async function autoExpireAbandonedPayments(
  prisma: PrismaClient,
  logger: FastifyLoggerInstance,
  abandonmentHours: number,
): Promise<number> {
  if (abandonmentHours <= 0) {
    logger.info('Payment abandonment is disabled (PAYMENT_ABANDONMENT_HOURS <= 0).');
    return 0;
  }

  const cutoff = new Date(Date.now() - abandonmentHours * 60 * 60 * 1000);

  try {
    const { count } = await prisma.payment.updateMany({
      where: {
        status: 'initiated',
        createdAt: { lt: cutoff },
      },
      data: {
        status: 'cancelled',
      },
    });

    if (count > 0) {
      logger.info({ expiredCount: count, cutoff: cutoff.toISOString() }, 'Auto-expired abandoned payments.');
    }

    return count;
  } catch (error) {
    logger.error({ err: error }, 'Error during abandoned payment expiration cron job.');
    return 0;
  }
}

export function startAbandonedPaymentsCron(prisma: PrismaClient, logger: FastifyLoggerInstance, abandonmentHours: number) {
  if (cronInterval) return;

  const runJob = () => autoExpireAbandonedPayments(prisma, logger, abandonmentHours).catch(err => logger.error({ err }, 'Abandoned payments cron job failed unexpectedly.'));
  cronInterval = setInterval(runJob, 60 * 60 * 1000); // Run every hour
}

export function stopAbandonedPaymentsCron() {
  if (cronInterval) clearInterval(cronInterval);
  cronInterval = null;
}