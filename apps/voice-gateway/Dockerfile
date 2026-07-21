# cache bust 2026-07-21-voice-gateway-prisma
# syntax=docker/dockerfile:1
# Build from the monorepo root: docker build -f apps/voice-gateway/Dockerfile .

FROM node:20-alpine AS base
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN npx turbo prune @zarax/voice-gateway --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
COPY tsconfig.base.json tsconfig.base.json
RUN pnpm --filter @zarax/database exec prisma generate
RUN pnpm turbo run build --filter=@zarax/voice-gateway...

FROM base AS runner
RUN addgroup -S zarax && adduser -S zarax -G zarax
COPY --from=installer /app .
USER zarax

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "apps/voice-gateway/dist/main.js"]
# cache bust 1784604574
# rebuild 1784607781
