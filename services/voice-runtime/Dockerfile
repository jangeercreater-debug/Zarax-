# syntax=docker/dockerfile:1
# voice-runtime uses @livekit/rtc-node, a native module that ships ONLY glibc
# prebuilt binaries (linux-x64-gnu / linux-arm64-gnu) — no musl build exists.
# Alpine (musl libc) therefore cannot load the native binding at runtime, so this
# service must build and run on a glibc base image (Debian slim) unlike the other
# Node services in this monorepo which use node:20-alpine.
FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN npx turbo prune @zarax/voice-runtime --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
COPY tsconfig.base.json tsconfig.base.json
RUN pnpm --filter @zarax/database exec prisma generate
RUN pnpm turbo run build --filter=@zarax/voice-runtime...

FROM base AS runner
RUN groupadd -r zarax && useradd -r -g zarax zarax
COPY --from=installer /app .
USER zarax

ENV NODE_ENV=production
EXPOSE 3008

CMD ["node", "services/voice-runtime/dist/main.js"]
