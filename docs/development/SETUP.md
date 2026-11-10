# Local Development Setup

> The root [README](../../README.md) covers the quick start. This page goes deeper on the daily workflow.

## Requirements

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20 (LTS recommended) | `node --version` |
| pnpm | ≥ 9 | `pnpm --version` |
| Docker Desktop | recent | used for PostgreSQL |
| Git | — | hooks are installed by `pnpm install` |

## First-Time Setup

```bash
pnpm install                      # installs dependencies + git hooks (husky)
cp .env.example .env              # local configuration (safe defaults)
docker compose up -d postgres     # start the database
pnpm nx run api:prisma-generate   # generate the Prisma client
pnpm nx run api:db-migrate        # apply migrations
pnpm nx run api:db-seed           # optional demo metadata
```

## Daily Workflow

```bash
pnpm dev                          # web (3000) + api (4000) concurrently
pnpm nx serve web                 # frontend only
pnpm nx serve api                 # backend only
pnpm nx run api:db-studio         # browse the database
```

The frontend proxies API requests in dev (see `apps/web/project.json` / vite dev-server config) and talks to `NEXT_PUBLIC_API_URL` from `.env` at runtime.

## Database Workflows

### Creating a schema change

1. Edit `apps/api/prisma/schema.prisma`.
2. Run `pnpm nx run api:db-migrate -- --name <describe_your_change>`.
3. Review the generated SQL in `apps/api/prisma/migrations/` **before committing**.

### Resetting local data

```bash
pnpm nx run api:db-reset          # drops and recreates, reapplies migrations
```

### Applying migrations without dev prompts (CI/staging)

```bash
pnpm nx run api:db-deploy
```

## Testing

```bash
pnpm nx run-many -t test          # unit tests, all projects
pnpm nx run api:test              # backend only
pnpm nx run api-e2e:e2e           # backend e2e foundation (starts the built app)
```

## Git Hooks

- `pre-commit` — Prettier + ESLint on staged files (fast, scoped).
- `commit-msg` — Conventional Commits validation.

If hooks did not install (e.g. you used `pnpm install --ignore-scripts`), run `pnpm exec husky`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `DATABASE_URL must be a valid PostgreSQL connection string` | `.env` missing — copy `.env.example`. |
| API starts but health reports `database: down` | Postgres not running → `docker compose up -d postgres`. |
| `pnpm nx` says "installation entry required" | Stale `.nx/` folder from a wrapper install — delete `.nx/`. |
| Prisma types out of date | `pnpm nx run api:prisma-generate`. |
| Windows path/permission errors in hooks | Ensure `core.autocrlf=input` (`git config --global core.autocrlf input`). |
