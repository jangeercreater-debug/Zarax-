# @zarax/api

Core domain service — tenants, users/auth, (agents to follow). This is the **reference
NestJS service** — every other service in `services/*` follows the same module
structure, bootstrap pattern, and shared-package wiring established here.

## Structure

```
src/
├── main.ts              # tracing → app bootstrap → middleware/filters/pipes
├── app.module.ts         # wires every shared package (config, logger, auth, observability, event-bus, db)
├── config/
│   └── env.schema.ts      # this service's composed zod env schema
├── common/
│   └── database.module.ts # exposes the shared PrismaClient via DI
└── modules/
    ├── auth/               # signup / login / refresh
    └── tenants/            # tenant read endpoints
```

## Endpoints

| Method | Path            | Auth      | Description |
|--------|-----------------|-----------|--------------|
| POST   | `/auth/signup`  | `@Public()` | Creates a tenant + its first (owner) user, returns tokens |
| POST   | `/auth/login`   | `@Public()` | Returns access + refresh tokens |
| POST   | `/auth/refresh` | `@Public()` | Exchanges a refresh token for a new token pair |
| GET    | `/tenants/me`   | any authenticated principal | Current tenant's public info |
| GET    | `/health`, `/ready`, `/metrics` | `@Public()` (framework-level) | From `@zarax/shared-observability` |

## Why some things are wired directly in `app.module.ts` instead of via DI

NestJS evaluates every `.forRoot()` dynamic-module call when `app.module.ts` is loaded —
before the DI container exists. `HealthModule.forRoot({ indicators })` needs a real
`PrismaClient`/`Redis` instance *at that point*, not a DI-injected one. So `app.module.ts`
builds those instances directly from `process.env` (not the validated `AppConfigService`,
which isn't available yet either) and re-exposes the same singleton instances through
`DatabaseModule` for every other part of the app to inject normally. This is a standard,
unavoidable pattern for NestJS static module configuration — see the comment block at the
top of `app.module.ts`.

## Local development

```bash
cp .env.example .env   # then fill in real secrets
pnpm --filter @zarax/database migrate:dev
pnpm --filter @zarax/api dev
```

## Docker

Build from the **monorepo root** (Turborepo's prune step needs the full workspace):
```bash
docker build -f services/api/Dockerfile -t zarax-api .
```
