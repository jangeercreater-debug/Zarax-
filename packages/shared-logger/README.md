# @zarax/shared-logger

Layer 1 — structured JSON logging (pino) with automatic correlation-id/tenant-id
injection into every log line via `AsyncLocalStorage`, and redaction of sensitive fields
(authorization headers, tokens, API keys, passwords) at the logger level so a stray
`logger.info({ user })` can't leak secrets.

## Wiring into a service

```ts
// main.ts
app.use(correlationIdMiddleware); // first, before everything else

// app.module.ts
LoggerModule.forRoot({ serviceName: 'api', level: config.get('LOG_LEVEL'), pretty: isDev })
```

`ZaraxLogger` implements Nest's `LoggerService` (swap in via `app.useLogger(...)`) and is
structurally compatible with `@zarax/shared-errors`' `ErrorFilterLogger` — pass it directly
to `new GlobalExceptionFilter(logger)` without either package importing the other.
