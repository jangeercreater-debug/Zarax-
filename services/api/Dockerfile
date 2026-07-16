# syntax=docker/dockerfile:1
# Build from the monorepo root: docker build -f services/api/Dockerfile .

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# Prune the monorepo down to only what @zarax/api needs (its own source plus
# every internal package it depends on) — keeps the build context and the
# final image free of unrelated services/apps.
# ---------------------------------------------------------------------------
FROM base AS pruner
COPY . .
RUN npx turbo prune @zarax/api --docker

# ---------------------------------------------------------------------------
# Install dependencies (cached separately from source for faster rebuilds)
# then build using the full pruned source.
# ---------------------------------------------------------------------------
FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@zarax/api...

# ---------------------------------------------------------------------------
# Slim runtime image — non-root user, only production dependencies + build
# output copied in.
# ---------------------------------------------------------------------------
FROM base AS runner
RUN addgroup -S zarax && adduser -S zarax -G zarax
COPY --from=installer /app .
USER zarax

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "services/api/dist/main.js"]
