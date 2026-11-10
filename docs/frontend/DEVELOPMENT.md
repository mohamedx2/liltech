# LilTech 2026 — Frontend Development & Verification Workflow

> Day-to-day commands for running, developing, testing, and verifying `apps/web/`.

---

## 1. Running the Frontend

### With the Real Backend (`NEXT_PUBLIC_API_MODE=real`, default)

Start PostgreSQL + API + Web together from the repo root:

```bash
cp .env.example .env
docker compose up -d postgres
pnpm nx run api:prisma-generate
pnpm nx run api:db-migrate
pnpm dev
```

Or run only the frontend against an already-running API (`http://localhost:4000/api` by default). On a fresh clone, build workspace library dependencies once so Turbopack resolves `libs/shared` and `libs/api-contracts` cleanly:

```bash
pnpm nx run web:build-deps
pnpm nx run web:dev
```

### Without a Backend (`NEXT_PUBLIC_API_MODE=mock`)

Useful when building UI workflows for endpoints not yet implemented in `apps/api`:

```powershell
# PowerShell (Windows)
$env:NEXT_PUBLIC_API_MODE="mock"
pnpm nx run web:dev
```

```bash
# bash / zsh / Git Bash
NEXT_PUBLIC_API_MODE=mock pnpm nx run web:dev
```

In `mock` mode, `/login` shows three development-only preset buttons (`team@liltech.mock`, `jury@liltech.mock`, `admin@liltech.mock`) and `/register` / `/event-state` resolve against in-memory mock handlers. Reset `NEXT_PUBLIC_API_MODE=real` before verifying real backend integration.

---

## 2. Linting, Typechecking, Formatting & Tests

Follow [`AGENTS.md`](../../AGENTS.md) §10 and §14 before opening any PR:

```bash
pnpm nx run web:lint
pnpm nx run web:test
pnpm exec tsc --noEmit -p apps/web/tsconfig.json
pnpm nx run web:build
pnpm format:check
```

Note on Nx workspace typechecking and specs:
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.spec.json` currently reports `TS6310` because [`apps/web/tsconfig.json`](../../apps/web/tsconfig.json) requires `"noEmit": true` for Next.js; Vitest (`pnpm nx run web:test`) and `next build` validate test/app code cleanly.
- Upstream [`pnpm-lock.yaml`](../../pnpm-lock.yaml) resolves `apps/web`'s `api-contracts` dependency to npm `0.2.0` instead of `workspace:*`; [`apps/web/vitest.config.mts`](../../apps/web/vitest.config.mts) and [`apps/web/next.config.ts`](../../apps/web/next.config.ts) (`turbopack.resolveAlias`) isolate `apps/web` to local `libs/api-contracts` and `libs/shared` without modifying root lockfiles.

Or run across affected workspace projects:

```bash
pnpm nx affected -t lint
pnpm nx affected -t test
```

> **PowerShell Note:** In Windows PowerShell, pass target lists quoted or run targets sequentially (`pnpm nx affected --targets="lint,test"`) because unquoted commas (`-t lint,test`) are split into spaces by PowerShell argument parsing.

---

## 3. Production Build Note on Windows

[`apps/web/next.config.ts`](../../apps/web/next.config.ts) sets `output: 'standalone'` for container deployments (`docker/`) and aliases `api-contracts` / `shared` via `turbopack.resolveAlias` to their compiled `libs/*/dist/index.js` artifacts (Nx executes `^build` automatically before `web:build`).

- Linux / macOS / CI / Windows with symlink support (Developer Mode enabled): `pnpm nx run web:build` completes end-to-end.
- **Windows without Developer Mode enabled:** Next.js compiles JavaScript, completes TypeScript checking, and generates static pages, then may fail only on the final standalone copy step with `A required privilege is not held by the client. (os error 1314)`. Do **not** remove `output: 'standalone'`.
- **Generated `next-env.d.ts` formatting:** Running `next build` may rewrite [`apps/web/next-env.d.ts`](../../apps/web/next-env.d.ts) with double quotes; run `pnpm exec prettier --write apps/web/next-env.d.ts` (or restore it via `git checkout -- apps/web/next-env.d.ts`) if `pnpm nx format:check` flags it.

---

## 4. Line Endings (Windows)

[`.prettierrc`](../../.prettierrc) enforces `"endOfLine": "lf"`.
If editing on Windows, configure `core.autocrlf input` and run Prettier on modified files before committing:

```bash
pnpm exec prettier --write "apps/web/**/*.{ts,tsx,css,md}" "docs/frontend/**/*.md"
pnpm format:check
```
