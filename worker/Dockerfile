FROM node:22-alpine AS base
RUN corepack enable pnpm

# Dev stage: `tsx watch` restarts the worker on source changes (hot reload).
# docker-compose.override.yml bind-mounts pass-sport-worker/ over /app and provides
# empty node_modules + pnpm-store volumes; this stage installs full deps (incl. tsx)
# at container start, then runs the watcher.
FROM base AS dev
WORKDIR /app
ENV NODE_ENV=development \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
CMD ["sh", "-c", "pnpm install --frozen-lockfile --store-dir /pnpm-store && exec pnpm dev"]

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
# tsconfig.build.json is what `pnpm build` compiles with — tsconfig.json also covers
# test/, which is not copied into the image.
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
# Drizzle migration SQL — read at runtime by runMigrations() / the postdeploy hook.
COPY drizzle ./drizzle

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 worker
USER worker

# No EXPOSE / PORT: pure queue consumer, no HTTP server.
CMD ["node", "dist/index.js"]
