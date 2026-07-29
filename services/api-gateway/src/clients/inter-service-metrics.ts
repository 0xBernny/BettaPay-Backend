import * as promClient from 'prom-client';

/**
 * Shared Prometheus metrics for all gateway → downstream HTTP calls.
 *
 * Labels:
 *   target_service  — logical name of the downstream service (e.g. "settlement-engine")
 *   endpoint        — path template of the called endpoint (e.g. "/api/settlements")
 *   status_code     — HTTP status code as a string, or "network_error" / "timeout"
 *
 * Both metrics are module-level singletons so every client instance shares the
 * same registry entries and Prometheus never sees duplicate registrations.
 */

export const interServiceRequestFailures = new promClient.Counter({
  name: 'inter_service_request_failures_total',
  help: 'Total number of failed HTTP requests from the gateway to downstream services',
  labelNames: ['target_service', 'endpoint', 'status_code'] as const,
});

export const interServiceRequestDuration = new promClient.Histogram({
  name: 'inter_service_request_duration_seconds',
  help: 'Duration of HTTP requests from the gateway to downstream services in seconds',
  labelNames: ['target_service', 'endpoint', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export interface InterServiceMetrics {
  failures: typeof interServiceRequestFailures;
  duration: typeof interServiceRequestDuration;
}

/** Default metrics object used by all clients when none is explicitly injected. */
export const defaultInterServiceMetrics: InterServiceMetrics = {
  failures: interServiceRequestFailures,
  duration: interServiceRequestDuration,
};
