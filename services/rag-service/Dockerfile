# syntax=docker/dockerfile:1
# Build from the monorepo root: docker build -f services/rag-service/Dockerfile .

FROM node:22-alpine AS base
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN npx turbo prune @zarax/rag-service --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
COPY tsconfig.base.json tsconfig.base.json
RUN pnpm turbo run build --filter=@zarax/rag-service...

FROM base AS runner
RUN addgroup -S zarax && adduser -S zarax -G zarax
COPY --from=installer /app .
USER zarax

ENV NODE_ENV=production
EXPOSE 3005

CMD ["node", "services/rag-service/dist/main.js"]
# cache bust 1784551564
