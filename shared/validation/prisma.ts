export type PrismaLogLevel = 'query' | 'info' | 'warn' | 'error';

export interface PrismaQueryEvent {
  query: string;
  duration: number;
}

export interface PrismaConnectable {
  $connect: () => Promise<void>;
}

export interface PrismaQueryable {
  $on: (event: 'query', callback: (event: PrismaQueryEvent) => void) => void;
}

export interface PrismaLogger {
  debug: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function shouldEnablePrismaQueryLogging(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'development';
}

export function getPrismaLogLevels(): PrismaLogLevel[] {
  const levels: PrismaLogLevel[] = ['error', 'warn'];
  if (shouldEnablePrismaQueryLogging()) {
    levels.push('query');
  }
  return levels;
}

export function setupPrismaQueryLogging(prisma: PrismaQueryable, logger: PrismaLogger): void {
  if (!shouldEnablePrismaQueryLogging()) return;

  prisma.$on('query', (event) => {
    logger.debug({ query: event.query, duration: event.duration }, 'Prisma query');
  });
}

export interface ConnectWithRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export async function connectWithRetry(
  prisma: PrismaConnectable,
  logger: PrismaLogger,
  options: ConnectWithRetryOptions = {}
): Promise<void> {
  const maxRetries = options.maxRetries ?? 10;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30000;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await prisma.$connect();
      return;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        logger.warn(
          { attempt: attempt + 1, maxRetries, delayMs: delay, err },
          'Database connection failed, retrying'
        );
        await sleep(delay);
      }
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error');
  throw new Error(`Failed to connect to database after ${maxRetries} attempts: ${message}`);
}

/**
 * Build a Prisma-compatible connection URL with pool and timeout parameters.
 *
 * Appends `connection_limit` and `pool_timeout` as query parameters to the
 * raw DATABASE_URL. These tell Prisma's internal query engine how many
 * concurrent connections to allow and how long to wait before timing out a
 * pooled connection request. Without explicit values Prisma defaults to an
 * unbounded pool — a recipe for connection exhaustion under load.
 *
 * The function safely detects whether the URL already carries a query string
 * (i.e. contains "?") and uses "&" instead of "?" to avoid clobbering any
 * pre-existing parameters such as sslmode, schema, or application_name.
 *
 * @param rawUrl   - The base DATABASE_URL (e.g. postgresql://user:pass@host:5432/db).
 * @param poolSize - Max connections in the Prisma pool (default: 10).
 * @param timeout  - Max seconds to wait for a connection from the pool (default: 10).
 */
export function buildPrismaConnectionUrl(
  rawUrl: string,
  poolSize: number = 10,
  timeout: number = 10,
): string {
  const sep = rawUrl.includes('?') ? '&' : '?';
  return `${rawUrl}${sep}connection_limit=${poolSize}&pool_timeout=${timeout}`;
}
