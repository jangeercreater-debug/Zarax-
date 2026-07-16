import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
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
  /** Instrumentations to disable by name (e.g. ['@opentelemetry/instrumentation-fs'] —
   * filesystem instrumentation is noisy and rarely useful). HTTP/Express/gRPC and
   * common DB client instrumentations stay on by default so a request's trace context
   * (W3C traceparent) automatically propagates across service boundaries — this is
   * what makes a voice session traceable end-to-end: LiveKit webhook → voice-gateway
   * → stt-service → llm-orchestrator → tool-executor → tts-service, each hop's HTTP
   * call carrying the parent trace ID without any manual header plumbing. */
  disabledInstrumentations?: string[];
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
  const disabled = new Set(options.disabledInstrumentations ?? ['@opentelemetry/instrumentation-fs']);

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: options.serviceName,
      [ATTR_SERVICE_VERSION]: options.serviceVersion ?? '0.1.0',
    }),
    traceExporter: options.otlpEndpoint
      ? new OTLPTraceExporter({ url: options.otlpEndpoint })
      : undefined,
    instrumentations: [
      getNodeAutoInstrumentations({
        ...Object.fromEntries([...disabled].map((name) => [name, { enabled: false }])),
      }),
    ],
  });

  sdk.start();

  const shutdown = (): void => {
    void sdk.shutdown().finally(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return sdk;
}
