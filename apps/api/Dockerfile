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
# The resolved CLI version is exported so the runtime stage can install the
# matching global `prisma` for the one-shot migrate service.
RUN pnpm nx sync \
  && pnpm --filter api exec prisma generate --schema=prisma/schema.prisma \
  && pnpm nx run api:build --skip-nx-cache \
  && node -p "require('./apps/api/node_modules/prisma/package.json').version" > /tmp/prisma-version.txt

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

CMD ["node", "dist/server.js"]
