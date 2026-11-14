# Production image for the API (multi-stage, pnpm + Nx monorepo aware).
# Build from the repository root:
#   docker build -f apps/api/Dockerfile -t liltech-api .

# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /repo

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY libs/shared/package.json libs/shared/
COPY libs/api-contracts/package.json libs/api-contracts/

RUN pnpm install --frozen-lockfile

COPY nx.json tsconfig.base.json tsconfig.json ./
COPY apps/api apps/api
COPY libs libs

# `pnpm exec prisma` is not resolvable from the workspace root (the binary
# lives in apps/api); use the same --filter pattern as the repo's Nx targets.
# `nx sync` regenerates the TypeScript project references for the subset of
# projects present in this build context (apps/web and apps/api-e2e are
# deliberately not copied here, so the committed root tsconfig.json is stale).
#
# The bundle keeps `pino` and `@prisma/client` external (they cannot be
# bundled), so the runtime needs a real node_modules tree next to the bundle:
# `api:prune` produces an installable dist (bundle + package.json + pruned
# lockfile); we copy the Prisma schema in, install prod deps and generate the
# client there. The CLI version is exported for the runtime stage's global
# install (used by the one-shot migrate service).
RUN pnpm nx sync \
  && pnpm --filter api exec prisma generate --schema=prisma/schema.prisma \
  && pnpm nx run api:prune --skip-nx-cache \
  && node -p "require('./apps/api/node_modules/prisma/package.json').version" > /tmp/prisma-version.txt \
  && cp -r apps/api/prisma apps/api/dist/prisma \
  && cd apps/api/dist \
  && pnpm install --frozen-lockfile --prod \
  && node "$(ls -d /repo/node_modules/.pnpm/prisma@*/node_modules/prisma | head -1)/build/index.js" generate --schema=prisma/schema.prisma

# Compile the database seed (plain CommonJS, no bundler) so the one-shot `seed`
# compose service can run `node dist/seed-build/prisma/seed.js` in the runtime
# stage. Imports resolve from the pruned node_modules next to the API bundle.
RUN pnpm --filter api exec tsc -p tsconfig.seed.json

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build --chown=appuser:appgroup /repo/apps/api/dist ./dist
COPY --from=build --chown=appuser:appgroup /repo/apps/api/prisma ./prisma
COPY --from=build /tmp/prisma-version.txt /tmp/prisma-version.txt

# The one-shot `migrate` service (docker-compose.prod.yml) needs the Prisma CLI
# with its full dependency tree — a pnpm store fragment is not runnable, so
# install the exact version pinned by the lockfile.
RUN npm install --global "prisma@$(cat /tmp/prisma-version.txt)" \
  && rm /tmp/prisma-version.txt

USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The Nx webpack build emits `main.js` (see apps/api/webpack.config.js —
# NxAppWebpackPlugin with main: ./src/server.ts, no filename override).
CMD ["node", "dist/main.js"]
