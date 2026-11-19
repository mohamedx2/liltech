# Architecture — LilTech 2026 Platform

> Status: living document. Update this file when the architecture changes (see `AGENTS.md` §13).

## System Overview

```text
┌────────────────────────────────────────────────────────────────────┐
│                          Participants / Jury / Admin               │
│                                 Browser                            │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTPS, JSON over /api
┌──────────────────────────────▼─────────────────────────────────────┐
│                        apps/web  (Next.js)                         │
│  • Server Components by default; client islands for interactivity  │
│  • Centralized typed API client (real / mock transport)            │
│  • Reads only NEXT_PUBLIC_* env vars — no secrets                  │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ typed contracts (libs/api-contracts)
┌──────────────────────────────▼─────────────────────────────────────┐
│                        apps/api  (Express 5)                       │
│  routes → modules → services          middleware: auth, rbac,      │
│  • Server-side business rules           validation, rate limit,    │
│  • Event phase authority                error handling, logging    │
│  • CTF flag validation (never exposed)                             │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ Prisma (only DB access layer)
┌──────────────────────────────▼─────────────────────────────────────┐
│                        PostgreSQL (Docker)                         │
│      single source of truth for teams, attempts, scores, state     │
└────────────────────────────────────────────────────────────────────┘
```

## Core Architectural Decisions

| Decision | Rationale |
|---|---|
| Backend is the single source of truth for event time & state | Phones lie; one authoritative clock and state machine prevents cheating and inconsistency. |
| REST/JSON only for v1 | The event is short and the team small; REST + typed contracts is the lowest-risk option. Real-time transport is an explicit later decision (see below). |
| Shared contracts library (`libs/api-contracts`) | Frontend and backend compile against the same types and Zod schemas; drift is caught at build time, not at 3 AM during the event. |
| Prisma inside `apps/api` only | Persistence details never leak into contracts or the frontend. |
| Two isolated challenge tracks | Two juries, two podiums: jury authorization is challenge-scoped at the API level, not the UI level. |

## Application Composition

- `apps/web` — Next.js App Router. Server Components for pages, Client Components only where interaction requires them. One centralized typed API client with pluggable transports (real HTTP / in-memory mock) selected via `NEXT_PUBLIC_API_MODE`.
- `apps/api` — Express 5. `app.ts` builds the app (testable, no listening); `server.ts` owns startup, database connection, and graceful shutdown. Feature work goes in `modules/` (feature-scoped routes + services) and `services/` (shared domain logic).
- `libs/api-contracts` — request/response types, Zod schemas, error codes, role/phase/progress enums. No framework imports.
- `libs/shared` — environment-independent utilities (time formatting, exhaustiveness helpers).

## Future Module Boundaries

Planned backend feature modules (not yet implemented — this documents the intended seams so early code doesn't block them):

```text
apps/api/src/modules/
├── auth/            # login, sessions/tokens, password handling
├── registration/    # team creation, participant invites, email delivery hook
├── participants/    # participant profiles, QR badge data
├── checkin/         # QR token verification, check-in state
├── event-state/     # phase machine, server time, launch/close controls
├── mini-ctf/        # flag validation, attempt log, rate limiting, unlock
├── challenges/      # challenge briefs & resources per track
├── submissions/     # deliverable upload, deadline enforcement
├── announcements/   # live announcements feed
├── jury/            # jury accounts, challenge scoping
├── scoring/         # score submission & validation
├── leaderboards/    # aggregated views
├── admin/           # team management, overrides (audited)
└── results/         # podiums & publication
```

Rules for module growth:

- Each module owns its routes and services; cross-module reads go through services, never direct Prisma reach-around.
- The event-state module is the only writer of event phase state.
- The mini-ctf module is the only holder of flag material.
- Admin overrides are recorded in an audit log.

## Real-Time Readiness (Decision Pending)

The specification requires live updates for: event countdown and phase changes, announcements, Mini-CTF unlock transitions, submission progress, jury scoring, and leaderboard updates.

**Decision (pending):** transport is not yet chosen — candidates are Server-Sent Events and WebSockets. To avoid locking the wrong abstraction in early:

- Frontend: API client exposes transports; a future `RealtimeTransport` interface will live next to it (`apps/web/src/lib/api/realtime/`) with mock and real implementations, mirroring the REST client pattern.
- Backend: real-time handlers will attach to the Express server from a dedicated module (`modules/realtime/`), subscribing to service-level events — never querying Prisma directly from socket handlers.
- Countdowns use server-provided timestamps (contract convention), so they work over polling regardless of the final transport choice.

Do not add a WebSocket/SSE dependency until the transport decision is recorded in `docs/decisions/`.

## Security Architecture Principles

- AuthN/AuthZ server-side with roles `team`, `jury`, `admin`; jury authorization includes challenge-track scoping.
- Flag material and challenge answers live server-side only.
- Rate limiting on flag submission and authentication endpoints.
- Audit log for administrative overrides.
- See `AGENTS.md` §9 for the complete security rulebook.

## Mini-CTF chain (LOUAGE 404)

The Mini-CTF is a seven-stage sequential chain owned by
`apps/api/src/modules/ctf`.

```
Client  ── GET /api/ctf/chain ─────────────▶ ctf.service.getChain
                                                 │  loads chain + per-team progress
                                                 │  resolves each stage: solved / unlocked / locked
                                                 ▼
                                        CtfStage, CtfHint, CtfProgress, CtfAttempt

Client  ── POST /api/ctf/stages/:slug/submit ─▶ ctf.service.submitAnswer
                                                 │  locked? → 403
                                                 │  draft/closed? → 403
                                                 │  rate limit (5/min/team/stage)
                                                 │  HMAC compare (constant time)
                                                 ▼
                                        one transaction:
                                          solvedAt <- now   (atomic claim)
                                          next stage   -> unlocked
                                          attempt row  -> correct
                                          audit row    -> ctf.stage_solved
                                          all required solved? -> team.challenge_unlocked
```

Rules that live only on the server:

- A stage is visible only when `CtfProgress.state = 'unlocked'`; stage 1 is
  unlocked implicitly for a checked-in team, everything else by solving the
  previous stage.
- Answers are HMAC-SHA256 digests keyed by `CTF_ANSWER_PEPPER`; the plaintext
  answer never exists in the database, the API or the client bundle.
- A `live` stage must have a digest (database `CHECK` constraint); an
  unprovisioned stage stays `draft` and refuses submissions, which blocks the
  chain rather than silently skipping it.
- `GET /api/challenges/current` recomputes "all required stages solved" on every
  request; the frontend cannot unlock anything.

Assets are not hosted by the platform: each stage stores a `assetDriveUrl`
validated against `drive.google.com` / `docs.google.com`.

See `docs/ctf/README.md` for provisioning, stage content and playtesting.
