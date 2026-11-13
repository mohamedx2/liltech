# Deployment configuration record

Last updated: 2026-11-13. This documents the deploy setup as it stands,
what was changed to get here, and what is still open.

## What deploys

Every push to `main` runs `verify` (lint, typecheck, test, build) and then,
automatically, the `deploy` job in `.github/workflows/ci.yml`:

1. Builds both production images (`apps/api/Dockerfile`, `apps/web/Dockerfile`)
   and pushes them to GHCR as `latest` + `sha-<commit>`.
2. SSHes to the VPS as root, copies `docker-compose.prod.yml` to
   `/opt/liltech`, writes `/opt/liltech/.env` from repository secrets,
   pulls, applies Prisma migrations (one-shot `migrate` service), starts the
   stack, then smoke-tests health.

The stack: web (:3000) + API (:4000) + Postgres 17 (internal only, data in a
named volume). Manual deploys: **Actions → CI → Run workflow**.

## GitHub configuration (set via `gh`, nothing committed)

Secrets (`Settings → Secrets and variables → Actions`):

| Secret | Value |
|---|---|
| `DEPLOY_SSH_KEY` | ed25519 private key (`team-access`) — validated against its public key before upload |
| `DEPLOY_SSH_HOST` | `72.61.20.23` |
| `DEPLOY_SSH_USER` | `root` |
| `DEPLOY_SSH_PORT` | `22` |
| `DB_PASSWORD` | random 32-char password, generated locally with a crypto RNG, never printed |

Variables: `DEPLOY_ENABLED=true` (the deploy job refuses to run while this is
not `true` — it is the "don't touch the VPS yet" switch). Optional overrides:
`NEXT_PUBLIC_API_URL`, `CORS_ORIGIN` (defaults use the raw IP: `http://72.61.20.23:3000` / `:4000/api`).

The SSH key exists **only** in GitHub secrets — never in the repo. The local
temp copy is deleted after each use.

## VPS state (as verified on 2026-11-13)

- Ubuntu, Docker 29.9.3 + Compose v5.7.1 installed; nothing else needed.
- No host firewall (ufw inactive, iptables ACCEPT-all) — nothing was changed
  on the VPS by hand; only the workflow writes there (`/opt/liltech`).
- `/opt/liltech/` contains `docker-compose.prod.yml` + `.env` (600).
- Postgres migrations were applied by the `migrate` service (Prisma 6.19.3).
- **First fully green deploy run: `43518594774` (2026-11-13).** All three
  containers healthy; API and web reachable from the internet on ports 3000
  and 4000 (health endpoint returns `{"status":"ok","database":{"status":"up"}}`).

## Issues found and fixed while getting the first green deploy

1. `pnpm exec prisma` is not resolvable from the workspace root — the repo's
   convention is `pnpm --filter api exec prisma …` (used in Dockerfile + migrate service).
2. The API runtime image needs a runnable Prisma CLI — the pnpm-store fragment
   copied before was not; the image now installs `prisma@<lockfile version>` globally at build time.
3. Nx typescript-sync failed inside Docker because the root `tsconfig.json`
   references projects absent from the partial build context — both Dockerfiles
   run `pnpm nx sync` before building.
4. The API bundle is `dist/main.js`, not `dist/server.js` — the image `CMD` now
   points at the real file (this was the first API crash-loop).
5. The webpack bundle keeps `pino`, `pino-pretty` (pino transport worker) and
   `@prisma/client` external, but the runtime image shipped no `node_modules`
   (`Cannot find module 'pino'` on boot). The API Dockerfile build stage now
   runs `pnpm nx run api:prune` to turn `apps/api/dist` into an installable
   package (bundle + `package.json` + pruned lockfile), copies the Prisma
   schema in, runs `pnpm install --frozen-lockfile --prod` and generates the
   Prisma client there before it ships to the runtime stage.
6. The first smoke test could hang ~1 h on a silently-dropped port (no
   `--max-time` on curl). Health is now gated on the VPS itself (hard fail);
   external reachability is a fast advisory warning only.

Commits: `ci(deploy): ship main to the VPS with Docker Compose` (#16),
`fix(api): resolve prisma CLI…` (#17), `fix(ci): run nx sync…` (#18),
`fix(ci): make the smoke test hang-proof…` (#19), `fix(api): point the image CMD…` (#20),
`fix(api): install prod deps next to the bundle via api:prune` (#22).

## Still open / recommended follow-ups

- Rotate the `team-access` SSH key: it was shared in plaintext chat and works
  as **root** on a public IP.
- Pin SSH host keys in the workflow (currently runtime `ssh-keyscan`) — see the
  comment in `ci.yml`.
- Consider a dedicated non-root deploy user instead of root.
- No domain yet: the platform is served on raw-IP ports 3000/4000. A reverse
  proxy (nginx/Caddy, 80/443, TLS) is the natural next step; `NEXT_PUBLIC_API_URL`
  and `CORS_ORIGIN` variables are already in place for it.
- `nx.json` `"analytics": true` and `next.config.ts` `agentRules: false` remain
  unreviewed side effects of PR #15 (flagged in that PR's review).
