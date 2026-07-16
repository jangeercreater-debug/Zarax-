# ZaraX

Enterprise-grade, human-like AI Voice Agent platform.

## Stack

- **Frontend:** Next.js, React, React Native (Expo)
- **Backend:** NestJS (domain-driven, stateless services)
- **Data:** PostgreSQL (Prisma), Redis, Qdrant
- **Real-time:** LiveKit, WebRTC
- **Speech:** Deepgram (STT), Cartesia AI (TTS)
- **LLM:** Claude, Groq, OpenAI, Gemini — behind a unified provider interface

## Monorepo layout

```
apps/            # Things with a UI or external-facing runtime (web, mobile, voice-gateway)
services/        # Internal domain services with no direct client
packages/         # Shared libraries consumed by apps/services
infra/            # Docker, Railway, CI/CD composite actions
```

See `/docs/architecture.md` (added in a later milestone) for the full system design.

## Prerequisites

- Node.js `20.11.0` (see `.nvmrc`)
- pnpm `>=9.0.0`
- Docker (for local Postgres/Redis/Qdrant)

## Getting started

```bash
corepack enable
pnpm install
pnpm dev
```

## Common commands

| Command              | Description                                  |
| -------------------- | --------------------------------------------- |
| `pnpm dev`            | Run all apps/services in dev mode (parallel)  |
| `pnpm build`          | Build all packages via Turbo (cached)         |
| `pnpm lint`           | Lint all packages                              |
| `pnpm typecheck`      | Type-check all packages                       |
| `pnpm test`           | Run unit tests                                |
| `pnpm db:migrate`     | Run Prisma migrations (dev)                   |
| `pnpm db:studio`      | Open Prisma Studio                             |

## Contributing

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced via commitlint). Pre-commit runs lint-staged; pre-push runs a full typecheck.
