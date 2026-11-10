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

RUN pnpm exec prisma generate --schema=apps/api/prisma/schema.prisma \
  && pnpm nx run api:build --skip-nx-cache

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build --chown=appuser:appgroup /repo/apps/api/dist ./dist
COPY --from=build --chown=appuser:appgroup /repo/apps/api/prisma ./prisma
COPY --from=build --chown=appuser:appgroup /repo/node_modules/.pnpm/prisma*/node_modules/prisma ./node_modules/prisma

USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
