# Backend Development Guide — LilTech 2026 Platform

Covers local environment setup, the database lifecycle, and how to run/test the backend.
`apps/api` is an Express 5 + TypeScript service with Prisma ORM against PostgreSQL.

## Requirements

- Node v20+, pnpm 10.x (enable via `corepack enable pnpm`), PostgreSQL 17.
- The workspace root runs pnpm workspaces: `pnpm install` at the root links `apps/api`, `apps/web`, `libs/api-contracts`, `libs/shared`.

## Environment variables (`apps/api/.env`, never committed)

Create `apps/api/.env` from `.env.example`. Values validated at startup by `config/env.ts` (fail fast on invalid config):

| Variable | Default | Meaning |
|---|---|---|
| `API_PORT` | `4000` | HTTP listen port |
| `API_HOST` | `0.0.0.0` | Listen host |
| `DATABASE_URL` | — | PostgreSQL connection string (`postgresql://user:pass@host:port/db?schema=public`) |
| `NODE_ENV` | `development` | `production` hides stack traces |
| `ALLOWED_ORIGINS` | `*` | CORS origin list |
| `SESSION_TTL_HOURS` | `24` | Session bearer token lifetime |

Local development on Windows: if PostgreSQL is already installed natively on port 5432, run the dev instance on **5433** (see below) and set `POSTGRES_PORT=5433` accordingly.

## Database

Postgres is provided via Docker Compose (root `docker-compose.yml`) **or** a local install.

### Local instance on Windows (port 5433)

A native Windows PostgreSQL service often holds 5432, so the local dev instance runs on 5433:

```powershell
# Start Docker Desktop once; then run a dev Postgres container:
docker run --name liltech-dev-db -e POSTGRES_USER=liltech -e POSTGRES_PASSWORD=local_dev_password -e POSTGRES_DB=liltech -p 5433:5432 -d postgres:17-alpine

# Create a dedicated test DB (for integration tests + CI service):
docker exec -it liltech-dev-db psql -U liltech -d liltech -c "CREATE DATABASE liltech_test;"
```

Local `.env` (uncommitted):

```ini
POSTGRES_PORT=5433
DATABASE_URL=postgresql://liltech:local_dev_password@localhost:5433/liltech?schema=public
TEST_DATABASE_URL=postgresql://liltech:local_dev_password@localhost:5433/liltech_test?schema=public
```

### Schema migrations

Every schema change ships as a reviewed migration; applied migrations are never reused/tampered with:

```powershell
pnpm nx run api:prisma-generate   # regenerate Prisma Client after schema changes
pnpm nx run api:db-migrate        # create + apply a new migration (interactive name)
# On Windows this Prisma version needs DATABASE_URL inline instead of --env-file:
$env:DATABASE_URL='postgresql://liltech:local_dev_password@localhost:5433/liltech?schema=public'; pnpm nx run api:db-migrate --name <change>
```

Test DB migrations — same command pointed at `liltech_test`:

```powershell
$env:DATABASE_URL='postgresql://liltech:local_dev_password@localhost:5433/liltech_test?schema=public'; pnpm nx run api:db-migrate
```

Schema validation: `pnpm --filter api exec prisma validate`.

## Running

Dev server (tsx against source, no bundler — Prisma engine resolves normally):

```powershell
$env:DATABASE_URL='postgresql://liltech:local_dev_password@localhost:5433/liltech?schema=public'; pnpm nx serve api
```

Listens on `API_PORT` (default 4000) after `connectDatabase()`. `server.ts` owns startup, DB lifecycle, and graceful shutdown (SIGINT/SIGTERM).

Production bundle: `pnpm nx run api:build` (Nx webpack). Note: bundling the Prisma query engine next to the bundle is a known packaging concern — deploy via the Dockerfile (workspace prune + `prisma generate` inside the container) rather than copying `dist/` directly on Windows.

## Seeds

`apps/api/prisma/seed.ts` is idempotent and metadata-only. **No credentials, flags, or challenge answers ever appear in seeds.** Run:

```powershell
$env:DATABASE_URL='postgresql://liltech:local_dev_password@localhost:5433/liltech?schema=public'; pnpm nx run api:db-seed
```

## Tests

Backend unit + integration tests run with vitest against `createApp()` (supertest) — never mocked Prisma; integration tests hit a dedicated test DB (`liltech_test`):

```powershell
pnpm nx run api:test                          # all api tests (integration gated on TEST_DATABASE_URL)
$env:TEST_DATABASE_URL='postgresql://liltech:local_dev_password@localhost:5433/liltech_test?schema=public'; pnpm nx run api:test   # with integration tests
pnpm nx affected -t test                      # tests for projects affected by a change
```

`TEST_DATABASE_URL` must point to an empty/seeded test database. CI (`docs/api/... .github/workflows/ci.yml`) spins a `postgres:17-alpine` service container on port 5433, runs `prisma migrate deploy` against `liltech_test`, then tests with `TEST_DATABASE_URL`.

If `TEST_DATABASE_URL` is unset, integration suites are skipped and the suite still passes (dev/CI-safe default).

## Lint & format

```powershell
pnpm nx run api:lint        # ESLint incl. module-boundary enforcement
pnpm format:check           # Prettier across the workspace
pnpm format                 # apply
```

## Service boundaries

- Routes are thin controllers; business logic lives in `services/` inside each `modules/<feature>/`.
- `modules/auth/` — password hashing (bcryptjs), session issue/verify/revoke, `requireAuth`/`requireRole` middleware.
- `modules/event-state/` — phase state machine (DB-backed single row), audited transitions.
- `modules/registration/` — team + participant creation, QR badge issuance.
- `modules/checkin/` — QR scan (single check-in via unique constraint), badge revocation, badge listing (admin).
- `modules/announcements/` — publish + read feed.
- `modules/admin/` — audit log read.
- `modules/audit/` — transactional `recordAuditLog`.
- `libs/api-contracts` owns all wire types + Zod schemas; `apps/api` maps Prisma models to contracts explicitly — Prisma models never leak into responses.

## Known local-environment notes

- Windows `NODE_ENV` set to empty string in your shell breaks Next.js prerendering under Nx (`web:build`). Set `NODE_ENV=production` (or leave unset) when building `apps/web` via Nx; CI is unaffected (no empty-string NODE_ENV).
- `web:build` can intermittently fail on Windows with "os error 1314" (symlink/create hardlink privilege) when several builds run in parallel — retry or run with `--parallel=1`. Pre-existing, unrelated to backend changes.
- `nx reset` can fail with `EBUSY` while a daemon holds a lock; kill the nx daemon PID and retry.
