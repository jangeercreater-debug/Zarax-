# @zarax/shared-observability

Layer 2 — every service gets `/health`, `/ready`, `/metrics`, and OpenTelemetry tracing
from the same three module imports, rather than reimplementing them per service.

```ts
// main.ts — must be the very first import/call in the file
import { setupTracing } from '@zarax/shared-observability';
setupTracing({ serviceName: 'api', otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT });

// app.module.ts
imports: [
  HealthModule.forRoot({ indicators: [/* service-specific DB/Redis/Qdrant pings */] }),
  MetricsModule.forRoot({ serviceName: 'api' }),
]
```

- `/health` — liveness only (process is up). Never fails due to a downstream dependency.
- `/ready` — readiness; runs whatever indicator functions the service registers.
- `/metrics` — Prometheus scrape endpoint; `zarax_http_requests_total` and
  `zarax_http_request_duration_seconds` are recorded automatically for every request via a
  global interceptor, labeled by method/templated-route/status code.

Health indicators intentionally aren't pre-built here for Postgres/Redis/Qdrant — those
clients live in Layer 3 packages (`database`, `redis-client`, `qdrant-client`), and Layer 2
cannot depend upward on them. Each service builds its own small indicator functions using
its already-injected clients and passes them into `HealthModule.forRoot()`.
