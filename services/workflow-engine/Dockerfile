# syntax=docker/dockerfile:1
# Build from the monorepo root: docker build -f services/workflow-engine/Dockerfile .

FROM node:20-alpine AS base
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN npx turbo prune @zarax/workflow-engine --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
COPY tsconfig.base.json tsconfig.base.json
RUN pnpm --filter @zarax/database exec prisma generate
RUN pnpm turbo run build --filter=@zarax/workflow-engine...

FROM base AS runner
RUN addgroup -S zarax && adduser -S zarax -G zarax
COPY --from=installer /app .
USER zarax

ENV NODE_ENV=production
EXPOSE 3007

CMD ["node", "services/workflow-engine/dist/main.js"]
