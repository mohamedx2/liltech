# Backend Implementation Plan — LilTech 2026 Platform

> Status: **Phase 1 deliverable** (analysis & plan). Implementation status:
> **P0–P4 complete** (auth, event-state phase machine, registration, QR check-in,
> announcements, audit log, migrations, unit + integration tests). **P5+ blocked**
> on open questions in `docs/decisions/OPEN_QUESTIONS.md` — nothing blocked is
> implemented.
>
> and proposes an implementation order that respects `docs/decisions/OPEN_QUESTIONS.md`.

---

## 1. Current Backend State (Audit)

### 1.1 What exists and works

| Element | Location | Notes |
|---|---|---|
| Express 5 app factory | `apps/api/src/app.ts` | helmet, CORS (origin list from env), JSON body limit 1 MB, request logger, no listening (test-friendly) |
| Server entry | `apps/api/src/server.ts` | owns startup, DB lifecycle, graceful shutdown |
| Error contract | `apps/api/src/middleware/error-handler.ts` | `{ "error": { "code", "message", "details?" } }`, matches `libs/api-contracts` |
| Error types | `apps/api/src/utils/api-error.ts` | `ApiError` + factories; codes mirror contract (additive list incl. `CTF_NOT_SOLVED`) |
| Request IDs + pino logging | `apps/api/src/middleware/request-logger.ts`, `utils/logger.ts` | structured logs, `x-request-id` header |
| Health endpoint | `apps/api/src/routes/health.routes.ts` | `GET /api/health`, distinguishes app-up/DB-down (200/503), documented in `docs/api/README.md` |
| **Authentication** | `modules/auth/` | bcrypt passwords, opaque DB-backed bearer sessions, `POST /api/auth/login|logout`, `GET /api/auth/me`, `requireAuth`/`requireRole` middleware, login rate limit |
| **Event-state machine** | `modules/event-state/` | `GET/POST /api/event-state`, audited atomic phase transitions, `EventPhaseState` single row |
| **Registration & participants** | `modules/registration/` | `POST /api/registration/teams` (3–5 validation, QR badge issuance), `GET /api/registration/teams/me` |
| **Check-in** | `modules/checkin/` | QR scan (single check-in, unique constraint), badge revocation, badge listing (admin) |
| **Announcements** | `modules/announcements/` | `POST` (admin) / `GET` (authenticated) `/api/announcements` |
| **Audit log** | `modules/audit/` + `modules/admin/` | transactional `recordAuditLog`, `GET /api/admin/audit-log` paginated |
| DB lifecycle | `apps/api/src/config/database.ts` | central Prisma connection + health check |
| Env validation | `apps/api/src/config/env.ts` | Zod-validated at startup, fail-fast |
| Prisma schema | `apps/api/prisma/schema.prisma` | event domain modeled: User, Session, Team, Participant, QrToken, CheckInRecord, EventPhaseState, Announcement, AuditLog + enums (3 migrations applied) |
| Seeds | `apps/api/prisma/seed.ts` | idempotent, metadata only |
| Tests | `apps/api/src/tests/integration.spec.ts` (+ unit specs) | 20 integration tests gated on `TEST_DATABASE_URL`, RBAC matrix, phase transitions, duplicate prevention |
| Nx targets | `apps/api/package.json` | `prisma-generate`, `db-migrate`, `db-deploy`, `db-seed`, `db-reset`, `db-studio`, serve/build |
| E2E scaffold | `apps/api-e2e/` | vitest + global/test setup |

Conventions already established (must be reused, not reinvented):

- Response/error shape from `libs/api-contracts`; timestamps ISO 8601 UTC.
- Roles `team` / `jury` / `admin`; phases `registration → checkin → live → submissions_closed → pitching → results`; team progress `registered → checked_in → ctf_unlocked → ctf_solved → challenge_unlocked → submitted`; tracks `track_a` / `track_b`.
- Contracts first: change `libs/api-contracts` → document in `docs/api/README.md` → implement backend → frontend.
- Prisma stays behind services; Prisma models never returned to clients (explicit mapping).

### 1.2 What does not exist yet (spec-driven gaps)

Everything blocked on `docs/decisions/OPEN_QUESTIONS.md` decisions: Mini-CTF structure / flag validation (Q2), track assignment (Q1 → challenge access, jury scoping), scoring aggregation & tie-breaks (Q3/Q5), leaderboards & visibility (Q4), results publication (Q3/Q4), file uploads (submission storage), real-time transport (Q7), email delivery for QR badges (Q8).

Implemented-but-pending-open-questions fields are intentionally absent where they would require inventing an answer (e.g. `Team.track`).

### 1.3 Environment findings (as of this audit)

- Node v20.20.2, Docker 29.2.1 present; **pnpm not on PATH** (enable via
  `corepack enable pnpm`); dependencies **not installed** (`pnpm install` required).
- Working tree is on `main` with one unrelated modified file (`opencode.json`) —
  per project rules, backend work must move to a `feat/…` branch and must not touch
  `opencode.json`.

---

## 2. Requirements Checklist (from the LilTech specification)

### 2.1 Entities (spec-derived; candidate DB model in §4)

- **User** (per role: `team`/`jury`/`admin`) + credentials (slow salted hash).
- **Team** (3–5 members), leader, progress state, track (❓ Q1).
- **Participant** (member of a team, incl. leader), profile data.
- **QrBadge / QrToken** — one per participant, high-entropy, revocable, server-verifiable.
- **CheckInRecord** — who, when, how verified; duplicate prevention.
- **Event/EventPhase** — current phase as server state (single source of truth), server time.
- **MiniCtfChallenge / FlagSubmissionAttempt** — attempt log, rate limiting (❓ Q2 structure).
- **MainChallenge** — brief/resources per track (❓ Q1 assignment).
- **Submission** — deliverable(s), deadline-enforced (❓ file storage rules pending spec detail).
- **JuryAssignment** — jury member ↔ challenge/track scope.
- **Score / EvaluationCriterion** — per jury, per challenge (❓ Q5 aggregation, Q3 tie-breaks).
- **Announcement** — live feed.
- **AuditLog** — sensitive admin actions.
- **Notifications** — email transport pending (❓ Q8); data model can proceed.

### 2.2 Workflows to enforce server-side

1. Team leader registers team (3–5 members, validation, duplicate prevention).
2. Each participant gets a QR badge; email delivery hook pending (Q8).
3. Staff/admin scans QR → check-in recorded once; revocation honored.
4. Admin launches event at 20:00 → phase `live`.
5. Eligible (checked-in) teams access the Mini-CTF (❓ Q2 team/track structure).
6. Server validates flag attempts; every attempt stored + timestamped; rate-limited.
7. Valid flag → team progress transitions to challenge unlocked (atomic).
8. Teams submit deliverables; deadline (08:00) + phase (`submissions_closed`) enforced.
9. Jury: scoped to one challenge; scores within allowed range and criteria; own-scores-only edits.
10. Admin publishes results at 11:00 → phase `results` (Q3/Q4 affect leaderboards/readbacks).
11. Administrative overrides recorded in audit log.

---

## 3. Governance Constraint — Blocked vs. Unblocked Work

`docs/decisions/OPEN_QUESTIONS.md` forbids inventing answers. Mapping:

| Open question | Blocks | Unblocked-adjacent work |
|---|---|---|
| Q1 track assignment | team model `track` field, challenge access | team/registration genealogy, participants |
| Q2 CTF structure | CTF data model | attempt-log pattern, rate limiter, progress transition gate |
| Q3 tie-break rules | leaderboard ordering | scoring storage |
| Q4 leaderboard visibility | leaderboard endpoints | score persistence |
| Q5 score aggregation | results computation | score entry/criteria storage |
| Q7 realtime transport | live updates module | polling-friendly contracts (server time) — already established |
| Q8 email provider | QR badge delivery | QR token generation/verification (database-only) |
| Q6 license | repo-level, no backend impact | — |

**Conclusion:** auth, event-state phase machine, registration/participants (without
track assignment), QR token lifecycle + check-in, announcements, and audit logging are
implementable without inventing answers. Mini-CTF structure, challenge access,
scoring aggregation, leaderboards, results publication, file-upload details, and
real-time need maintainer decisions first. The plan below sequences accordingly and
never silently resolves an open question.

---

## 4. Candidate Database Model (draft — subject to §3 constraints)

Draft only to plan migrations; written as migrations only after the corresponding
open questions are resolved (see §6 phases). Tentatively:

```text
User        (id, role, email?, name, passwordHash, timestamps)          — unblocked
Session     (id/token hash, userId, expiresAt, revokedAt)               — unblocked
Team        (id, name, leaderId, progressState, track?, timestamps)     — track ❓ Q1
Participant (id, teamId, name, …)                                       — unblocked
QrToken     (id, participantId, tokenHash, revokedAt, expiresAt?)       — unblocked
CheckIn     (id, participantId, checkedInAt, checkedByUserId)  unique   — unblocked
EventState  (key/value: phase, phaseChangedAt, openedBy)                — unblocked
AttemptLog  (teamId, submittedAt, wasValid flag only, ipFingerprint)    — flag material ❓ Q2
Submission  (id, teamId, submittedAt, payload refs)                     — deadline logic unblocked; storage ❓
JuryScope   (userId, track/challengeId)                                 — ❓ Q1 scoping target
Score       (juryUserId, criterionId, …)                                — ❓ Q1/Q5
Announcement(id, authorId, body, publishedAt)                           — unblocked
AuditLog    (id, actorId, action, target, at, metadata)                 — unblocked
```

Hard rules for implementation (from `AGENTS.md` §8):

- Every schema change ships as a reviewed migration; never reuse/tamper applied migrations.
- Explicit FKs, unique constraints (one check-in per participant, one jury scope per member, …), indexes on hot paths.
- Idempotent seeds; **no flags/answers/credentials ever** in seeds, code, logs, or API responses.

---

## 5. Security Requirements (implementation checklist)

- Passwords: argon2id/bcrypt hashing (choice: smallest-dependency option; argon2id preferred).
- AuthN: server-side sessions (DB-backed token, hashed at rest) — fits REST + avoids JWT revocation issues; expiry + revocation.
- AuthZ middleware: role check per route + resource-level checks (leader-only registrations, own-scores-only jury edits, jury ± track scoping).
- Rate limiting: server-side counters on login and flag submission (module-owned counters; no extra dependency unless agreed).
- QR tokens: ≥128-bit entropy, stored as hash only, revocable, verified against DB.
- Input validation on every endpoint via shared Zod schemas from `libs/api-contracts` (with mapping to internal types).
- `NODE_ENV=production` hides stack traces (already handled by error handler).
- Audit trail for: phase transitions, jury assignment changes, deadline overrides, results publication.

---

## 6. Implementation Phases (dependency-ordered)

| Phase | Contents | Depends on |
|---|---|---|
| **P0 — Tooling/environment** | `corepack enable pnpm`, `pnpm install`, `.env`, postgres up, migrations baseline green | — |
| **P1 — Contracts & auth foundation** | `libs/api-contracts`: auth schemas (login, session, error codes additions); `modules/auth`: argon2id hashing, session issue/verify/refresh-revoke, `requireRole` middleware; ratelimit on login | P0 |
| **P2 — Event-state machine** | module `event-state`: current phase (DB-backed), server time endpoint, admin-only transitions with audit entries; contract `eventStateResponseSchema` | P1 (auth/admin) |
| **P3 — Registration & participants** | team creation (3–5 validation), participants, QR token issuance + issuance hooks exposed for a future email module | P2 (uses phases for open/closed) |
| **P4 — Check-in** | module `checkin`: QR verification, single check-in (unique constraint + transaction), admin/staff endpoints | P3 |
| **P5 — Mini-CTF (post-decision)** | after Q2: challenge/flags tables, attempt log, rate limiter, progress transition | P2–P4, Q2 |
| **P6 — Challenges & submissions** | after Q1 (+ storage decision): challenge scoping, deadline enforcement | P5, Q1 |
| **P7 — Jury, scoring, results** | after Q3/Q4/Q5: score entry, aggregation, publication, podiums | P6, Q3–Q5 |
| **P8 — Leaderboards, announcements, realtime** | after Q4/Q7: read models, announcements module, realtime module | P7, Q4, Q7 |
| **P9 — Ops hardening** | e2e coverage, load-safe indexes, docs consolidation | incremental |

Each phase ships with unit + integration tests (supertest), contract updates in
`libs/api-contracts` first, and `docs/api/README.md` updated in the same PR.

## 7. Testing Strategy

- **Unit:** services (progress transitions, validation, rate limiting, hashing).
- **Integration:** supertest against `createApp()` with a **dedicated test database**
  (separate `DATABASE_URL` via `NODE_ENV=test`); test the DB behavior: unique check-in,
  deadline windows, duplicate registration rejection, RBAC matrix (each endpoint × role).
- **E2e:** `apps/api-e2e` for the full team journey (register → check-in → CTF → submit → scored).
- Never mock Prisma; run the real test DB. CI target: `pnpm nx affected -t test`.

## 8. Documentation Deliverables (per prompt §12)

- `docs/backend/BACKEND_IMPLEMENTATION_PLAN.md` ← this file
- `docs/backend/API_DOCUMENTATION.md` (mirror + link `docs/api/README.md`; only endpoints that exist)
- `docs/backend/DATABASE.md` (per-migration rationale, pointing at `prisma/migrations/`)
- `docs/backend/DEVELOPMENT.md` (env, seeds, test DB setup)

## 9. Suggested Conventional-Commit Slices

```text
docs(backend): add backend implementation plan
feat(api-contracts): add auth and registration contracts
feat(api): add login and session authentication
feat(api): add role-based authorization middleware
feat(api): add event phase state machine with audit log
feat(api): add team and participant registration
feat(api): add QR badge tokens and secure check-in
test(api): cover registration and authorization workflows
```
