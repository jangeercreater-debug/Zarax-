# syntax=docker/dockerfile:1
# Build from the monorepo root: docker build -f services/rag-service/Dockerfile .

FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN npx turbo prune @zarax/rag-service --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@zarax/rag-service...

FROM base AS runner
RUN addgroup -S zarax && adduser -S zarax -G zarax
COPY --from=installer /app .
USER zarax

ENV NODE_ENV=production
EXPOSE 3005

CMD ["node", "services/rag-service/dist/main.js"]
