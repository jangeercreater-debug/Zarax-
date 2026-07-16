# @zarax/api-standards

Layer 4 — distributed rate limiting, write-endpoint idempotency, and the standard
success-response envelope. See `docs/production-standards.md` items #4, #5, #8.

## Wiring

```ts
ApiStandardsModule.forRoot({
  redisUrl: process.env.REDIS_URL ?? '',
  defaultRateLimit: { limit: 100, windowMs: 60_000 },
})
```

- **Rate limiting**: `RateLimitGuard` applies the default to every route; override per
  route with `@RateLimit({ limit, windowMs })` (e.g. a stricter budget on `/auth/login`).
  Keyed by tenant+principal when authenticated, falling back to IP for `@Public()` routes.
- **Idempotency**: opt-in per request via an `Idempotency-Key` header on POST/PUT/PATCH/
  DELETE — a repeat with the same key replays the cached response; a concurrent
  duplicate in flight gets a 409, not a race with the original.
- **Response envelope**: every success response becomes `{ data, requestId }`,
  mirroring `@zarax/shared-errors`' `{ error: { code, message, requestId, details } }`
  shape for failures.

Uses its own dedicated Redis connection (not `@zarax/redis-client`'s `RedisCacheModule`)
to avoid a global-provider token collision if a service wires both.
