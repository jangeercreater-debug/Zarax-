# syntax=docker/dockerfile:1
# Build from the monorepo root: docker build -f apps/web/Dockerfile .

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN npx turbo prune @zarax/web --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@zarax/web...

FROM base AS runner
RUN addgroup -S zarax && adduser -S zarax -G zarax
COPY --from=installer /app .
USER zarax

ENV NODE_ENV=production
ENV PORT=3100
EXPOSE 3100

CMD ["pnpm", "--filter", "@zarax/web", "start", "--", "-p", "3100"]
