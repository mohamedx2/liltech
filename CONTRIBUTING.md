# Contributing to LilTech 2026 Platform

Thank you for considering contributing! This guide walks you through your first contribution step by step. If anything is unclear, open a [documentation improvement issue](.github/ISSUE_TEMPLATE/documentation_improvement.md) — that's a contribution too.

Before writing code, please read [`AGENTS.md`](./AGENTS.md). It describes the project boundaries, architecture rules, and conventions every contributor (human or AI) must follow.

## Setting Up Your Environment

### 1. Prerequisites

- **Node.js** (LTS) — package scripts use `pnpm nx` and Node ≥ 20 is required by the toolchain
- **pnpm** — the package manager (`corepack enable pnpm` or `npm i -g pnpm`)
- **Git**
- **Docker + Docker Compose** — for the PostgreSQL database

### 2. Fork and clone

1. Fork the repository on GitHub.
2. Clone **your** fork:

```bash
git clone https://github.com/<your-username>/liltech.git
cd liltech
```

3. Add the original repository as `upstream` so you can pull updates:

```bash
git remote add upstream https://github.com/mohamedx2/liltech.git
git fetch upstream
```

### 3. Install dependencies

```bash
pnpm install
```

pnpm installs dependencies for every workspace project using the lockfile.

### 4. Configure environment variables

```bash
cp .env.example .env
```

Then adjust values if needed. The defaults work out of the box for local development. **Never commit your `.env`.**

### 5. Start PostgreSQL

```bash
docker compose up -d postgres
docker compose ps   # wait until `postgres` is healthy
```

### 6. Set up the database

```bash
pnpm nx run api:prisma-generate   # generate the Prisma client
pnpm nx run api:db-migrate        # apply migrations (creates a migration if none exists)
```

## Branching

This is a small open-source project — feature branches branch **from and target `main`**.

```bash
git switch main
git pull upstream main            # or origin, if you work on a maintainer clone
git switch -c feat/short-description
```

Branch naming:

| Prefix | Use for |
|---|---|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `docs/` | Documentation only |
| `refactor/` | Code changes that don't change behavior |
| `test/` | Test additions or changes |
| `chore/` | Tooling, dependencies, housekeeping |
| `ci/` | CI/CD changes |

A `develop` integration branch may be introduced later if maintainers decide it is necessary.

## Commit Message Format

We enforce [Conventional Commits](https://www.conventionalcommits.org/). A git hook (`commit-msg`) validates messages, and CI rejects non-conforming titles in squash merges.

```text
<type>(<scope>): <description>
```

Examples:

```text
feat(web): add team registration form skeleton
feat(api): add health endpoint with database check
fix(api): handle database connection errors gracefully
docs(readme): document local development workflow
chore(monorepo): configure nx task pipeline
test(api): cover flag submission rate limiting
ci(github): run affected builds on pull requests
```

Rules:

- `type` is one of: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- `scope` identifies the affected project: `web`, `api`, `shared`, `api-contracts`, `monorepo`, `docker`, `ci`, `docs`…
- The description is lowercase, imperative, no trailing period, ≤ 100 characters
- Breaking changes: add `!` after the type (`feat(api)!: …`) or `BREAKING CHANGE:` in the message body

## Before You Open a PR

Run the checks locally:

```bash
pnpm format                        # format everything
pnpm nx run-many -t lint typecheck # lint + type checks
pnpm nx run-many -t test           # tests
pnpm nx run-many -t build          # production builds
```

Note: `git add` runs Prettier and ESLint on staged files automatically (via lint-staged + Husky), and commit messages are validated. Don't bypass these hooks with `--no-verify` unless you have a very good reason (and say so in the PR).

## Submitting a Pull Request

1. Push your branch to your fork:

```bash
git push -u origin feat/short-description
```

2. Open a PR targeting **`main`** on GitHub. The [pull request template](.github/PULL_REQUEST_TEMPLATE.md) will guide you; fill it completely.
3. Make sure CI passes. CI runs formatting, lint, type checks, tests, and build on affected projects.
4. Request review. Address review comments with additional commits (they'll be squashed on merge).

### Review & merge

- PRs require at least one maintainer approval.
- We use **squash merge** by default, so the PR title becomes the commit on `main` — keep it a valid Conventional Commit.
- Ordinary contributors cannot push directly to `main`; even maintainers should use PRs.

## Reporting Issues

- **Bugs** → [bug report](.github/ISSUE_TEMPLATE/bug_report.md)
- **Features** → [feature request](.github/ISSUE_TEMPLATE/feature_request.md)
- **Docs** → [documentation improvement](.github/ISSUE_TEMPLATE/documentation_improvement.md)
- **Tasks** → [technical task](.github/ISSUE_TEMPLATE/technical_task.md)
- **Security vulnerabilities** → **privately** via GitHub Security Advisories — see [`SECURITY.md`](./SECURITY.md). Never open public issues with exploit details.

## Code Review

Reviews focus on correctness, security (this platform handles real participant data and competition integrity), consistency with the architecture in `AGENTS.md`, and maintainability. Expect direct, kind, and specific feedback; please respond to it in good spirits — we're all volunteers building an event platform.

## Need Help?

- Browse [open issues](https://github.com/mohamedx2/liltech/issues) — good first issues are labeled `good first issue`.
- Ask in an issue or contact a maintainer of GDG on Campus EPI / ISITCom Google Club.
