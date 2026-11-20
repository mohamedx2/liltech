# LilTech 2026 Platform — Rules for Contributors and AI Agents

**Read this file before changing any code.** It applies to human contributors and to coding agents (OpenCode, Claude Code, Cursor, etc.). If a task conflicts with these rules, stop and raise the conflict instead of improvising.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

---

## 1. Project Overview

**LilTech 2026** is the digital hub of a student hackathon held November 21–22, 2026 at Campus EPI, Sousse, Tunisia, organized by **GDG on Campus EPI** and the **ISITCom Google Club**.

> Tagline: **One night. Two challenges. One platform to run it all.**

The platform handles: team registration, participant accounts with personal QR badges, QR check-in, Mini-CTF flag challenges, main challenge unlocking, challenge information, team submissions with file uploads, live announcements, jury accounts with challenge-scoped access, live scoring, leaderboards, administration, and results/podium publication.

**Users:** participants (team role), jury members, and administrators/staff.

**Event shape:** two parallel challenge tracks, two separate juries, two podiums.

**Event workflow:** team leader registers a team (4–7 members) → administrators email every participant a personal QR code (Admin → Emails) → staff scan QR codes at the entrance → at 20:00 administrators launch the event → the Mini-CTF opens for eligible checked-in teams → a valid flag unlocks the team's main challenge → teams submit deliverables until 08:00 → pitches at 09:00 → jury evaluation → results and podiums published at 11:00.

**Canonical states:**

- Event phases: `registration`, `checkin`, `live`, `submissions_closed`, `pitching`, `results`
- Team progress: `registered`, `checked_in`, `ctf_unlocked`, `ctf_solved`, `challenge_unlocked`, `submitted`

These live in `libs/api-contracts` — do not redefine them elsewhere.

## 2. Architecture

| Layer | Technology | Location |
|---|---|---|
| Monorepo | Nx 24 + pnpm workspaces | root |
| Frontend | Next.js (App Router), React, TypeScript | `apps/web` |
| Backend | Node.js, Express 5, TypeScript | `apps/api` |
| Database | PostgreSQL (Docker), Prisma ORM | `apps/api/prisma` |
| Shared utils | TypeScript, environment-independent | `libs/shared` |
| API contracts | Types + Zod schemas, no runtime frameworks | `libs/api-contracts` |
| Infrastructure | Docker, Docker Compose, GitHub Actions | root, `docker/`, `.github/` |

Principles:

- **The backend is the source of truth** for event time and state. The frontend never decides whether a challenge is unlocked.
- REST API under `/api`, JSON only, ISO 8601 UTC timestamps, server-provided time for countdowns.
- Error contract: `{ "error": { "code": string, "message": string } }` — see `libs/api-contracts/src/lib/errors.ts` and `docs/api/`.

## 3. Project Boundaries

Enforced by the `@nx/enforce-module-boundaries` ESLint rule (see root `eslint.config.mjs`):

- `apps/web` may import from `libs/shared` and `libs/api-contracts`. It must **never** import backend implementation code, `@prisma/client`, or Express internals.
- `apps/api` may import from `libs/shared` and `libs/api-contracts`. It must **never** import frontend implementation code.
- `libs/api-contracts` is standalone: types and Zod schemas only, no Express, no Prisma, no React. Do not expose database models (Prisma types) as API contracts — map explicitly.
- `libs/shared` is environment-independent utility code (no Node-only APIs, no browser APIs, no frameworks).
- Prisma client usage stays inside `apps/api` — treat generated code as a persistence detail behind services.

When you need to add a cross-boundary dependency, put it in `libs/api-contracts` (if it's a wire contract) or `libs/shared` (if it's generic logic). Never duplicate types across apps.

## 4. Development Principles

- TypeScript **strict mode** everywhere. No `any` without written justification; no unjustified type assertions; no duplicated type definitions.
- Small, focused changes. One logical change per PR.
- Clear, searchable names. No abbreviations that are not domain terms (`ctf`, `qr` are fine).
- Separation of concerns: routes thin, services carry logic, middleware is cross-cutting.
- No unnecessary abstractions; no duplicated business logic; no new dependencies without discussion; no undocumented architecture changes.
- Business rules are enforced **server-side**. Never trust frontend state.
- Keep the terminology of the LilTech specification (`team`, `jury`, `admin`, `Mini-CTF`, `check-in`, …).

## 5. Frontend Rules (apps/web)

- Next.js **App Router** conventions; Server Components by default; Client Components (`'use client'`) only when interactivity requires it.
- **One centralized, typed API client** (`apps/web/src/lib/api`). Components never call `fetch` directly and never hardcode API URLs. Switching mock/real backends is configuration (`NEXT_PUBLIC_API_MODE`), never a code rewrite.
- Environment variables: only `NEXT_PUBLIC_*` reach the browser; validate them in `apps/web/src/config/env.ts`; never expose secrets or DB credentials to the browser.
- Accessible HTML (landmarks, labels, `aria-*` where needed), responsive layouts, and complete **loading / error / empty / success** states for every async view.
- Global error and not-found pages exist — keep them working.
- No direct database access from the frontend, ever.

## 6. UI/UX Rules

Use the **UI UX Pro Max** skill (already available in this environment) as the primary design intelligence resource for all interface work. Its design data and guidance live in `.opencode/skills/ui-ux-pro-max/`.

Before implementing any complex screen, establish a deliberate design system: color, typography, spacing, components. Use the token layer in `apps/web/src/app/globals.css` as the base and extend it consciously.

- Strong visual hierarchy; consistent spacing, color, and component behavior.
- Accessibility is not optional: keyboard navigation, visible focus, color contrast, `prefers-reduced-motion` support.
- Clear interaction feedback (hover, active, loading, success, error).
- Operational screens (check-in, scoring, admin) stay **fast and functional** — no decorative animation.
- Avoid generic AI-generated dashboard aesthetics: no random gradients, no excessive glassmorphism, no gratuitous motion, no inconsistent one-off components.
- Different audiences need different density: participants (clear, friendly), staff check-in (fast, scannable), jury (focused on evaluation), admins (information-dense, safe controls).

## 7. Backend Rules (apps/api)

- Modular Express architecture: `routes/` → thin controllers, `services/` → business logic, `modules/` → feature packages. The `app.ts`/`server.ts` split exists so tests can import the app without a database or port.
- Validate every input (Zod, schemas shared with `libs/api-contracts` where sensible).
- All errors flow through the centralized error handler; use `ApiError` and its factories; correct HTTP status codes.
- Structured logs (pino) with request IDs; no sensitive values in logs.
- Environment configuration is validated at startup (`config/env.ts`); fail fast on invalid config.
- Graceful shutdown; database connection lifecycle managed centrally (`config/database.ts`).
- Authentication and authorization boundaries: role checks (`team`/`jury`/`admin`) server-side; a jury member may only access their assigned challenge and may only edit their own scores.
- **CTF flags and challenge answers must never** appear in source code, seeds, migrations, logs, or public API responses. Flag validation happens only on the server; every attempt is timestamped and recorded; rate-limit incorrect submissions.
- Submission deadlines, event phases, and score ranges are enforced server-side.
- Administrative overrides are logged (audit trail).
- Use transactions where multi-step writes must be atomic.

## 8. Database Rules

- **Prisma is the only database access layer.** No raw SQL from feature code (health checks excepted).
- Schema changes go through reviewed migrations (`pnpm nx run api:db-migrate`). Never push schema changes directly to shared or production databases.
- Design indexes and constraints deliberately; every foreign key and uniqueness rule should be explicit.
- Seeds are idempotent and safe (`apps/api/prisma/seed.ts`); no production credentials, no flags/answers in seeds.
- The initial schema is intentionally minimal (`SystemSetting`). The full event domain is modeled only after open questions are confirmed — see `docs/decisions/OPEN_QUESTIONS.md`. Do not add speculative models.
- Prisma models never leak into public API responses.

## 9. Security Rules

- **Passwords:** hashed with a modern, salted, deliberately slow algorithm (argon2id or bcrypt). Never stored or logged in plaintext. **Accepted exception (organizer decision, 2026-11-15):** jury account passwords are also stored readable (`User.juryPlainPassword`) so administrators can hand them to jury members; they are returned only by admin-only endpoints and never logged. Do not extend this to any other role.
- **Authentication:** server-side sessions or short-lived signed tokens; no security logic in the frontend.
- **RBAC:** every protected endpoint declares and checks its role server-side; jury access is challenge-scoped.
- **Input validation** on every endpoint (body, params, query). Reject unknown fields where it matters.
- **Rate limiting** on sensitive endpoints (login, flag submission) with server-side counters.
- **File uploads:** validate type, size, and name; store outside the webroot or via object storage; never trust client filenames.
- **QR tokens:** high-entropy, single-participant, revocable, server-verifiable; treat them as credentials.
- **Secrets:** only in environment variables (`.env`, never committed); only `NEXT_PUBLIC_*` values may reach the browser; no hardcoded keys anywhere.
- **Audit logs** for sensitive administrative actions (launch event, override deadline, edit jury, publish results).
- Report vulnerabilities privately — see `SECURITY.md`.

## 10. Testing Rules

- Every meaningful behavior change ships with tests. Unit tests for logic, integration tests for endpoints (supertest against `app.ts`), e2e foundations live in `apps/api-e2e`.
- Test behavior, not implementation details.
- **Never claim tests passed without actually running them.** Run the relevant targets:

```bash
pnpm nx run-many -t test            # all
pnpm nx run api:test                # one project
pnpm nx affected -t test            # only affected by your change
```

## 11. Git Rules

- **Conventional Commits** enforced by commitlint: `<type>(<scope>): <description>` — types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
- Work on feature branches (`feat/…`, `fix/…`, `docs/…`, `chore/…`, `ci/…`, `refactor/…`, `test/…`) branched from `main`.
- Every change goes through a Pull Request. No direct pushes to `main`. No force pushes to shared branches.
- Never commit secrets, real `.env` files, build artifacts, or machine-specific files.
- Pre-commit hooks run Prettier + ESLint on staged files; commit messages are validated. Do not use `--no-verify` without explaining why in the PR.

## 12. AI Agent Rules

1. Read `AGENTS.md` before changing code.
2. Inspect the relevant project and existing patterns before editing.
3. Understand the task; ask when ambiguous.
4. Plan non-trivial changes before implementing.
5. Use the installed skills where they fit (see the table below).
6. Make focused changes — do not refactor beyond the task.
7. Run relevant tests and checks (`pnpm nx affected -t lint,typecheck,test,build`).
8. Review your own diff before reporting completion.
9. Report changed files and verification results honestly — including failures.
10. Identify unresolved questions instead of inventing answers (see `docs/decisions/OPEN_QUESTIONS.md`).

### Skill selection guide

| Task | Recommended skill |
|---|---|
| Requirements exploration | Superpowers |
| Complex implementation planning | Superpowers |
| TypeScript architecture | Matt Pocock Skills |
| TypeScript code quality | Matt Pocock Skills |
| Test-driven development | Superpowers |
| Debugging | Superpowers |
| Code review | Superpowers + engineering skills |
| Frontend design | UI UX Pro Max |
| UI/UX audit | UI UX Pro Max |
| Responsive design | UI UX Pro Max |
| Accessibility review | UI UX Pro Max |
| Nx scaffolding / generators | nx-generate |
| Running Nx tasks | nx-run-tasks |

See `docs/development/AI_SKILLS.md` for installation and usage details. Use relevant skills — do not invoke every skill for every task.

## 13. Documentation Rules

Update documentation when changing:

- Architecture → `docs/architecture/` and this file
- Environment variables → `.env.example` and `README.md`
- API contracts → `libs/api-contracts` + `docs/api/`
- Database schema → migrations + `docs/architecture/`
- Developer workflows → `README.md` / `CONTRIBUTING.md`
- CI/CD or deployment configuration → `.github/` and `README.md`

Uncommitted documentation drift is treated as incomplete work.

## 14. Definition of Done

A task is complete only when **all** of the following hold:

- [ ] Implementation is complete and focused
- [ ] Relevant tests pass (actually executed)
- [ ] Lint passes (`pnpm nx affected -t lint`)
- [ ] TypeScript checks pass (`pnpm nx affected -t typecheck`)
- [ ] Formatting is correct (`pnpm format:check`)
- [ ] Documentation updated where needed
- [ ] No secrets or unnecessary files introduced
- [ ] The final diff has been reviewed
