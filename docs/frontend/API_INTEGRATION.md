# LilTech 2026 — Frontend API Integration Guide

> Documents the centralized typed API client in `apps/web/src/lib/api/`, transport switching (`real` vs `mock`), provisional contract isolation, and backend readiness tracking.

---

## 1. Single API Entry Point (`apps/web/src/lib/api/`)

Per [`AGENTS.md`](../../AGENTS.md) §5, UI components **never** call `fetch()` directly and **never** hardcode backend URLs. Every HTTP call goes through `api` exported from [`apps/web/src/lib/api/index.ts`](../../apps/web/src/lib/api/index.ts).

```text
apps/web/src/lib/api/
├── index.ts                 # Exports `api` singleton (Real or Mock by env.NEXT_PUBLIC_API_MODE)
├── endpoints.ts             # Implemented vs planned path registry
├── transport.ts             # ApiTransport interface (with credentials support)
├── errors.ts                # ApiClientError & normalizeHttpError (parses { error: { code, message } })
├── contracts/
│   └── pending.ts           # Provisional Zod schemas & types reusing `libs/api-contracts` enums
├── modules/                 # Domain-grouped client methods (validate responses via Zod)
│   ├── health.ts            # GET /health (canonical `healthResponseSchema` from libs/api-contracts)
│   ├── events.ts            # GET /event-state
│   ├── auth.ts              # POST /auth/login, POST /auth/logout, GET /auth/me
│   └── registrations.ts     # POST /registrations
└── transports/
    ├── real.ts              # Fetch transport (`buildRequestUrl` + `credentials: 'include'`)
    ├── mock.ts              # Routes mock requests cleanly; returns 404 NOT_FOUND for unknown paths
    └── mocks/               # Modular dev-only mock handlers + in-memory dev state
```

### URL Resolution (`buildRequestUrl`)

`NEXT_PUBLIC_API_URL` defaults to `http://localhost:4000/api` (`apps/web/src/config/env.ts`). [`createRealTransport`](../../apps/web/src/lib/api/transports/real.ts) joins paths via `buildRequestUrl(baseUrl, path)` so leading slashes like `/health` or `/auth/login` resolve to `http://localhost:4000/api/health` and `http://localhost:4000/api/auth/login` (avoiding the standard `new URL('/health', 'http://host/api')` pitfall that drops `/api`).

Credentials default to `'include'` so cookie/session authentication works cleanly with the Express CORS configuration (`credentials: true` in `apps/api/src/app.ts`).

---

## 2. Backend Implementation Status & Contract Alignment

The table below details how the frontend client modules relate to the backend Express routes in `apps/api`:

| Module | Endpoint(s) Used by Frontend | Backend Status | Contract Source | Behavior in `real` Mode |
|---|---|---|---|---|
| `health` | `GET /api/health` | **Implemented** | `healthResponseSchema` (`libs/api-contracts`) | Calls live Express API & displays DB connection status and latency |
| `events` | `GET /api/event-state`, `POST /api/event-state` | **Implemented** | `eventStateResponseSchema` (`libs/api-contracts`) | Authoritative server clock, current phase banner, and admin phase stepper transitions |
| `auth` | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | **Implemented** | Canonical auth contracts (`libs/api-contracts`) | Rate-limited login (10 attempts/min), DB-backed session tokens, automatic Bearer header |
| `registrations` | `POST /api/registration/teams`, `GET /api/registration/teams/me` | **Implemented** | `createTeamRequestSchema`, `teamResponseSchema` (`libs/api-contracts`) | Enforces 3–5 member constraints, creates leader account and participant badges |
| `checkin` | `POST /api/checkin/scan`, `POST /api/checkin/revoke`, `GET /api/checkin/badges` | **Implemented** | Canonical checkin contracts (`libs/api-contracts`) | Validates 43-character hashed tokens, updates attendee counts, allows credential revocation |
| `announcements` | `POST /api/announcements`, `GET /api/announcements` | **Implemented** | `createAnnouncementRequestSchema`, `announcementSchema` (`libs/api-contracts`) | Admin broadcast publishing and live feed polling across roles |
| `admin` | `GET /api/admin/audit-log` | **Implemented** | `auditLogListRequestSchema`, `auditLogEntrySchema` (`libs/api-contracts`) | Audited administrative actions stream with actor attribution and pagination |
| `jury` | `GET /api/jury/overview`, `GET /api/jury/teams`, `GET/POST /api/jury/evaluation` | **Planned (Mocked)** | `pending.ts` (`juryOverviewResponseSchema`, `juryTeamEvaluationResponseSchema`) | Track-scoped evaluation rubric and private jury notes |
| `participants` / `mini-ctf` / `challenges` / `submissions` | `/participants/*`, `/mini-ctf/*`, `/challenges/*`, `/submissions/*` | **Planned (Mocked)** | `pending.ts` schemas | Competitor workspace flows, flag unlock, deliverables uploads |

### Session & Bearer Token Management

- When authenticating via `POST /api/auth/login`, the backend issues an opaque session token (`LoginResponse.token`).
- The token is managed through [`apps/web/src/lib/auth/token-storage.ts`](../../apps/web/src/lib/auth/token-storage.ts) (`localStorage` with in-memory fallback for SSR).
- [`createRealTransport`](../../apps/web/src/lib/api/transports/real.ts) automatically attaches `Authorization: Bearer <token>` to outbound requests.
- When an API request returns `401 Unauthorized`, the client clears the token and transitions the user to an unauthenticated state.

### Migrating Provisional Contracts to `libs/api-contracts`

1. As backend contributors add Zod schemas to `libs/api-contracts/src/lib/`, remove the corresponding provisional schema from [`apps/web/src/lib/api/contracts/pending.ts`](../../apps/web/src/lib/api/contracts/pending.ts).
2. Update imports in `apps/web/src/lib/api/modules/*.ts` and `apps/web/src/lib/api/transports/mocks/*.ts` to import directly from `'api-contracts'`.
3. Update path strings in [`endpoints.ts`](../../apps/web/src/lib/api/endpoints.ts) if the finalized REST route naming differs, then verify in `NEXT_PUBLIC_API_MODE=real`.

---

## 3. Error Handling Contract

All API failures throw `ApiClientError` ([`apps/web/src/lib/api/errors.ts`](../../apps/web/src/lib/api/errors.ts)) with:
- `status`: HTTP status (`0` for network failure)
- `code`: Backend canonical code (`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `CTF_NOT_SOLVED`, `INTERNAL`, `NETWORK_ERROR`, or fallback)
- `message`: Human-readable error message from `{ "error": { "code", "message" } }`
- `isNetworkError`: Boolean flag

Rate-limited requests (`429 RATE_LIMITED`) and HTTP `404`/`501` unimplemented endpoints are handled explicitly across `LoginForm`, `TeamRegistrationForm`, and `EventPhaseBanner` with accessible error alerts.

---

## 4. Server-Synchronized Countdowns

Per [`AGENTS.md`](../../AGENTS.md) §2 and [`docs/api/README.md`](../api/README.md), countdowns must never rely blindly on the client clock:
- Event responses return authoritative ISO 8601 UTC `serverTime` and `nextPhaseAt` strings.
- [`ServerCountdown`](../../apps/web/src/components/events/server-countdown.tsx) parses both timestamps via `parseIsoTimestamp` from `libs/shared`, computes `offsetMs = serverMs - Date.now()` once when timestamps change, and ticks `Date.now() + offsetMs` until expiration.

---

## 5. Development Mock Mode (`NEXT_PUBLIC_API_MODE=mock`)

- Mock handlers live inside `apps/web/src/lib/api/transports/mocks/` and run only when `NEXT_PUBLIC_API_MODE=mock`.
- Mock accounts (`team@liltech.mock`, `jury@liltech.mock`, `admin@liltech.mock`) and mock banner controls are strictly gated behind `env.NEXT_PUBLIC_API_MODE === 'mock'` and contain **zero real credentials or CTF flags**.
- Keep `NEXT_PUBLIC_API_MODE=real` for staging/production builds.
