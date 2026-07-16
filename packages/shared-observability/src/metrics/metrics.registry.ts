import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * One registry per process. Every service gets the same metric names
 * (`zarax_http_requests_total`, `zarax_http_request_duration_seconds`) so dashboards
 * and alerts written once work identically across all services.
 */
export class MetricsRegistry {
  public readonly registry = new Registry();

  public readonly httpRequestsTotal = new Counter({
    name: 'zarax_http_requests_total',
    help: 'Total number of HTTP requests processed.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  public readonly httpRequestDurationSeconds = new Histogram({
    name: 'zarax_http_request_duration_seconds',
    help: 'HTTP request duration in seconds.',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  constructor(serviceName: string) {
    collectDefaultMetrics({ register: this.registry, prefix: 'zarax_', labels: { service: serviceName } });
  }
}
