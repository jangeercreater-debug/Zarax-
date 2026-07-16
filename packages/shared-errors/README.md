# @zarax/shared-errors

Layer 1 — `AppError` hierarchy (`ValidationError`, `NotFoundError`, `ForbiddenError`,
`ConflictError`, `RateLimitedError`, `ExternalServiceError`, etc.) and a `GlobalExceptionFilter`
that normalizes every thrown error (AppError, NestJS HttpException, or an unexpected bug)
into one stable `ApiErrorResponse` shape from `@zarax/shared-types`.

Register in any service's `main.ts`:
```ts
app.useGlobalFilters(new GlobalExceptionFilter(loggerInstance));
```

Deliberately does not import `@zarax/shared-logger` directly (both are Layer 1 — see
`/docs/dependency-rules.md`); the filter accepts anything structurally matching the small
local `ErrorFilterLogger` interface, and `@zarax/shared-logger`'s logger satisfies it.
