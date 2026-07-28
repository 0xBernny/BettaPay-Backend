import type { Job, Worker } from 'bullmq';

export interface WorkerShutdownLogger {
  warn: (obj: Record<string, unknown>, msg: string) => void;
}

export interface ActiveJobInfo {
  id?: string;
  data: unknown;
}

export const DEFAULT_WORKER_SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Starts tracking the worker's currently-active job so shutdown can report it if the
 * worker gets stuck. Must be called once, right after the worker is created — a job
 * that became active before shutdown began would otherwise be invisible to
 * closeWorkerWithTimeout, since BullMQ only fires 'active' when a job starts.
 */
export function trackActiveJob(worker: Worker): () => ActiveJobInfo | undefined {
  let activeJob: ActiveJobInfo | undefined;

  worker.on('active', (job: Job) => {
    activeJob = { id: job.id, data: job.data };
  });
  worker.on('completed', () => {
    activeJob = undefined;
  });
  worker.on('failed', () => {
    activeJob = undefined;
  });

  return () => activeJob;
}

/**
 * Closes a BullMQ worker without letting a stuck job block shutdown indefinitely.
 *
 * BullMQ's `worker.close()` only honors the `force` flag on the call that starts
 * the close — any later call made while that close is still pending returns the
 * same in-flight promise, so a stuck job can't be escalated to a forced close
 * mid-shutdown. Instead, this stops waiting after `timeoutMs` and lets the caller
 * proceed; BullMQ's stalled-job checker recovers the job on another worker instance.
 */
export async function closeWorkerWithTimeout(
  worker: Worker,
  workerName: string,
  log: WorkerShutdownLogger,
  getActiveJob: () => ActiveJobInfo | undefined,
  timeoutMs: number = DEFAULT_WORKER_SHUTDOWN_TIMEOUT_MS,
): Promise<void> {
  let timedOut = false;
  const timeout = new Promise<void>((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve();
    }, timeoutMs);
  });

  await Promise.race([worker.close(), timeout]);

  if (timedOut) {
    const activeJob = getActiveJob();
    log.warn(
      { workerName, jobId: activeJob?.id, jobData: activeJob?.data },
      'Worker did not close within shutdown timeout — force-stopping and proceeding with shutdown',
    );
  }
}
