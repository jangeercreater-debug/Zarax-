import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export interface TracingOptions {
  serviceName: string;
  serviceVersion?: string;
  /** OTLP collector endpoint. If omitted, tracing initializes with no exporter configured
   * (spans are created but not shipped) — acceptable for local dev without a collector. */
  otlpEndpoint?: string;
}

/**
 * Starts the OpenTelemetry SDK. Must be called as the *first* thing in `main.ts`,
 * before importing `@nestjs/core` or the app module, so auto-instrumentation can
 * patch HTTP/Express/Postgres/Redis clients before they're first required.
 *
 *   // main.ts, line 1:
 *   import { setupTracing } from '@zarax/shared-observability';
 *   setupTracing({ serviceName: 'api', otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT });
 *   // ...then the rest of main.ts's imports and bootstrap logic
 */
export function setupTracing(options: TracingOptions): NodeSDK {
  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: options.serviceName,
      [ATTR_SERVICE_VERSION]: options.serviceVersion ?? '0.1.0',
    }),
    traceExporter: options.otlpEndpoint
      ? new OTLPTraceExporter({ url: options.otlpEndpoint })
      : undefined,
    instrumentations: [], // Populated per-service (auto-instrumentations-node) once each
    // service's actual DB/HTTP client choices are finalized in later milestones — kept
    // empty here to avoid instrumenting libraries a given service doesn't use.
  });

  sdk.start();

  process.on('SIGTERM', () => {
    void sdk.shutdown().finally(() => process.exit(0));
  });

  return sdk;
}
