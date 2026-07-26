import http, { type Server } from 'http';

interface MinimalLogger {
  info: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

/**
 * Resolves the port the metrics server binds to. Defaults to `appPort + 1000`
 * (e.g. 4000 for a service running on 3000) so metrics stay separated from
 * the application port without requiring per-service config.
 */
export function resolveMetricsPort(appPort: number): number {
  const raw = process.env.METRICS_PORT;
  if (raw) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return appPort + 1000;
}

export interface StartMetricsServerOptions {
  /** The service's application port, used to derive the default metrics port. */
  appPort: number;
  /** Content-Type header for the metrics response (e.g. prom-client's `register.contentType`). */
  contentType: string;
  /** Returns the current metrics payload (e.g. prom-client's `register.metrics()`). */
  getMetrics: () => Promise<string> | string;
  log: MinimalLogger;
}

/**
 * Starts a minimal, dedicated HTTP server that serves only `GET /metrics` —
 * intentionally with no auth, no rate limiting, and no request logging, so a
 * Prometheus scraper can hit it without exposing or throttling application
 * endpoints. Runs on its own port (see resolveMetricsPort) so this data never
 * shares the application's listener.
 */
export function startMetricsServer(options: StartMetricsServerOptions): Server {
  const port = resolveMetricsPort(options.appPort);

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/metrics') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    Promise.resolve(options.getMetrics())
      .then((body) => {
        res.writeHead(200, { 'Content-Type': options.contentType });
        res.end(body);
      })
      .catch((error: unknown) => {
        options.log.error({ error }, 'Failed to collect metrics');
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Failed to collect metrics');
      });
  });

  server.listen(port, '0.0.0.0', () => {
    options.log.info({ port }, `Metrics server listening on :${port}/metrics`);
  });

  return server;
}
