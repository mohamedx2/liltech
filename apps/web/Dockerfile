# Production image for the web app (multi-stage, pnpm + Nx monorepo aware).
# Build from the repository root:
#   docker build -f apps/web/Dockerfile -t liltech-web .

# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /repo

RUN corepack enable

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY libs/shared/package.json libs/shared/
COPY libs/api-contracts/package.json libs/api-contracts/

RUN pnpm install --frozen-lockfile

COPY nx.json tsconfig.base.json tsconfig.json ./
COPY apps/web apps/web
COPY libs libs

# Regenerate the TypeScript project references for the subset of projects in
# this build context (apps/api and apps/api-e2e are not copied here).
RUN pnpm nx sync

# NEXT_PUBLIC_* variables are baked in at build time; pass them as build args.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_API_MODE=real
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_MODE=$NEXT_PUBLIC_API_MODE

RUN pnpm nx run web:build --skip-nx-cache

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=build --chown=appuser:appgroup /repo/apps/web/.next/standalone ./
COPY --from=build --chown=appuser:appgroup /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=appuser:appgroup /repo/apps/web/public ./apps/web/public

USER appuser

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
