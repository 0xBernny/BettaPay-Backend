/**
 * Structured startup health check reporting (Issue #383)
 *
 * Runs dependency checks (Prisma, Redis, BullMQ), measures latency, and logs
 * a single structured report at startup. Fatal exit on critical failures.
 */

import type { FastifyInstance } from 'fastify';

export interface StartupCheckResult {
  name: string;
  status: 'ok' | 'fail' | 'skip';
  durationMs: number;
  error?: string;
}

export interface StartupReport {
  service: string;
  version: string;
  uptime: number;
  checks: StartupCheckResult[];
  overallStatus: 'healthy' | 'unhealthy';
}

async function timedCheck(
  name: string,
  fn: () => Promise<void>,
  critical: boolean,
): Promise<StartupCheckResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, status: 'ok', durationMs: Date.now() - start };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return {
      name,
      status: critical ? 'fail' : 'ok',
      durationMs: Date.now() - start,
      error,
    };
  }
}

export interface RunStartupChecksOptions {
  service: string;
  version: string;
  logger: FastifyInstance['log'];
  checks: Array<{ name: string; fn: () => Promise<void>; critical: boolean }>;
}

export async function runStartupChecks(options: RunStartupChecksOptions): Promise<StartupReport> {
  const { service, version, logger, checks } = options;
  const startTime = Date.now();

  const results: StartupCheckResult[] = [];
  let hasCriticalFailure = false;

  for (const check of checks) {
    const result = await timedCheck(check.name, check.fn, check.critical);
    results.push(result);

    if (result.status === 'fail') {
      hasCriticalFailure = true;
      logger.fatal(
        { check: result.name, durationMs: result.durationMs, error: result.error },
        `Startup check failed: ${result.name}`,
      );
    } else if (result.error) {
      logger.warn(
        { check: result.name, durationMs: result.durationMs, error: result.error },
        `Startup check degraded: ${result.name}`,
      );
    } else {
      logger.info(
        { check: result.name, durationMs: result.durationMs },
        `Startup check passed: ${result.name}`,
      );
    }
  }

  const report: StartupReport = {
    service,
    version,
    uptime: Date.now() - startTime,
    checks: results,
    overallStatus: hasCriticalFailure ? 'unhealthy' : 'healthy',
  };

  logger.info(report, 'Startup health report');

  if (hasCriticalFailure) {
    logger.fatal('Critical startup checks failed — exiting');
    process.exit(1);
  }

  return report;
}
