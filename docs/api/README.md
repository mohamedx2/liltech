# API Documentation — LilTech 2026 Platform

> Status: documents the agreed contract conventions from the LilTech specification and the currently implemented endpoints. Future endpoints are documented as proposals until implemented.

## Conventions

- **Base path:** `/api`
- **Format:** JSON request and response bodies
- **Timestamps:** ISO 8601 UTC strings; countdowns must be computed from **server-provided** time
- **Roles:** `team`, `jury`, `admin` — enforced server-side
- **Error contract:**

```json
{
  "error": {
    "code": "CTF_NOT_SOLVED",
    "message": "Solve the Mini-CTF first."
  }
}
```

Error codes are defined in `libs/api-contracts/src/lib/errors.ts` and are additive (clients must treat unknown codes as generic errors).

Current codes: `CONFLICT`, `CTF_NOT_SOLVED`, `FORBIDDEN`, `INTERNAL`, `NOT_FOUND`, `RATE_LIMITED`, `UNAUTHORIZED`, `VALIDATION_ERROR`.

## Implemented Endpoints

### Health

#### `GET /api/health`

Returns application health, distinguishing API availability from database availability.

**Response `200`** (application healthy, database reachable):

```json
{
  "status": "ok",
  "uptimeSeconds": 42,
  "timestamp": "2026-11-10T12:00:00.000Z",
  "database": { "status": "up", "latencyMs": 2 }
}
```

**Response `503`** (application running, database unreachable): same shape with `"status": "degraded"` and `"database": { "status": "down" }`.

Schema: `healthResponseSchema` in `libs/api-contracts`.

### Authentication

Authentication uses opaque, DB-backed session bearer tokens (`Authorization: Bearer <token>`). Tokens are stored hashed server-side and expire after the server-configured lifetime (`SESSION_TTL_HOURS`).

#### `POST /api/auth/login`

Authenticates a user by email + password and issues a session token.

**Request body:**

```json
{ "email": "string", "password": "string" }
```

**Response `200`:**

```json
{
  "account": { "id": "uuid", "role": "team|jury|admin", "name": "string", "email": "string" },
  "token": "opaque bearer credential (43 chars, base64url)",
  "expiresAt": "ISO 8601 UTC"
}
```

Errors: `UNAUTHORIZED` for bad credentials; `RATE_LIMITED` above 10 attempts/minute per IP.

Schema: `loginRequestSchema` / `loginResponseSchema`.

#### `POST /api/auth/logout`

Revokes the bearer session token of the current request. No body.

**Response `204`** on success; `UNAUTHORIZED` when no session exists.

#### `GET /api/auth/me`

Returns the account of the authenticated bearer token.

**Response `200`:** the account object (id, role, name, email — never credentials).

Schema: `accountSchema`. Errors: `UNAUTHORIZED` when unauthenticated.

### Event state

The backend is the single writer of event phase state; clients only read. Phase order: `registration → checkin → live → submissions_closed → pitching → results`.

#### `GET /api/event-state`

Public. Returns the current phase, when it was entered, and the authoritative server time (used by clients for countdowns).

**Response `200`:**

```json
{ "phase": "registration|checkin|...", "phaseChangedAt": "ISO 8601 UTC", "serverTime": "ISO 8601 UTC" }
```

Schema: `eventStateResponseSchema`.

#### `POST /api/event-state`

Admin only. Atomically transitions the phase and records an audit entry (`event_phase_transition`).

**Request body:** `{ "phase": "checkin|live|..." }`

**Response `200`:** the new event state shape (same as GET). Errors: `CONFLICT` when the requested phase equals the current phase; `FORBIDDEN` for non-admin. Audit entry `event.phase_changed` recorded.

Schema: `updateEventStateRequestSchema` / `eventStateResponseSchema`.

### Registration

#### `POST /api/registration/teams`

Public. Registers a team of 3–5 members (leader + 2–4 members). Creates the leader account (password ≥ 12 chars, bcrypt) plus participant records. Issues one revocable QR badge token **per participant** (raw token returned once, stored hashed server-side). Duplicate team name or leader email → `CONFLICT` (409).

**Request body:**

```json
{
  "teamName": "string (3–60)",
  "leader": { "name": "string", "email": "string", "password": "string (≥12)" },
  "members": [ { "name": "string", "email?": "string" } ]
}
```

**Response `201`:** `teamResponseSchema` (id, name, progressState `registered`, leader, participants) plus a `badges` array of `issueBadgeResponseSchema` (participantId, participantName, raw token, issuedAt).

Schema: `createTeamRequestSchema` / `teamResponseSchema` + `issueBadgeResponseSchema[]`.

#### `GET /api/registration/teams/me`

Authenticated as `team`. Returns the authenticated team's own registration: participants with their check-in status (`checkedInAt` when checked in).

Schema: `participantSummarySchema` list wrapped in `teamResponseSchema`.

### Check-in (staff)

Admin-only endpoints. QR tokens are verified against their stored SHA-256 hash; raw token material is never echoed back for validation.

#### `POST /api/checkin/scan`

**Request body:** `{ "token": "<43-char base64url QR token>" }`

Records a single check-in for the badge's participant. **Response `200`:** `{ participant, team, checkedInAt }`. Errors: `NOT_FOUND` (unknown token), `FORBIDDEN` (revoked badge), `CONFLICT` (already checked in — unique constraint).

Schema: `scanCheckInRequestSchema` / `checkInResponseSchema`.

#### `POST /api/checkin/revoke`

**Request body:** `{ "token": "<43-char base64url QR token>" }`

Revokes a badge token (treated as a credential). Audit entry `checkin.badge_revoked` recorded.

**Response `204`**; `NOT_FOUND` when unknown.

#### `GET /api/checkin/badges`

Returns all badges (participant name, team name, issuedAt, revokedAt?, checkedInAt?) for staff review.

Schema: `badgeSummarySchema[]`.

### Announcements

#### `POST /api/announcements`

Admin only. Publishes a live announcement (body 1–500 chars). Records audit entry `announcement_published`.

**Request body:** `{ "body": "string" }` → **Response `201`:** `{ id, body, publishedAt, authorName }`.

#### `GET /api/announcements`

Any authenticated role (`team`, `jury`, `admin`). Reads the announcement feed, newest first.

Schema: `createAnnouncementRequestSchema` / `announcementSchema`.

Note: real-time delivery transport is pending (OPEN_QUESTIONS #7); clients may poll with the server-provided timestamps until then.

### Audit log

#### `GET /api/admin/audit-log`

Admin only, offset-paginated (limit 1–100, default 50; offset ≥ 0), newest first. Returns sensitive administrative actions recorded server-side (actions: `event.phase_changed`, `checkin.scan`, `checkin.badge_revoked`, `announcement.published`, `registration.team_created`). Entry `details` are intentionally not exposed.

**Response `200`:** `{ entries: [{ id, action, actorName?, createdAt }], limit, offset }`.

Schema: `auditLogListRequestSchema` / `auditLogEntrySchema` list.

### Mini-CTF (LOUAGE 404)

Seven sequential stages. Every decision (which stage is current, whether a
submission is accepted, when the main challenge unlocks) is made server-side;
the client only renders `/ctf/chain`.

All endpoints require `Authorization: Bearer <token>` with the `team` role.

#### `GET /api/ctf/chain`

Returns the team, the seven-stage tracker and the stage the team may work on.

```json
{
  "team": { "name": "Team Rocket" },
  "stages": [
    { "slug": "louage-404-01", "position": 1, "title": "The Louage", "state": "unlocked", "status": "live", "requiredForUnlock": true },
    { "slug": "louage-404-02", "position": 2, "title": "The Location", "state": "locked", "status": "live", "requiredForUnlock": true }
  ],
  "current": {
    "stage": {
      "slug": "louage-404-01",
      "position": 1,
      "totalStages": 7,
      "title": "The Louage",
      "description": "...",
      "status": "live",
      "state": "unlocked",
      "assetDriveUrl": "https://drive.google.com/drive/folders/...",
      "hintCount": 3
    },
    "progress": { "attempts": 0, "hintsUsed": 0, "solved": false, "solvedAt": null },
    "hints": []
  },
  "summary": { "solved": 0, "total": 7 },
  "eligible": true
}
```

`current` is `null` when the team has solved everything (or is not eligible).
`eligible` is false until the team has checked in. No answer, digest or pepper
is ever part of this payload.

#### `GET /api/ctf/stages/:slug`

One stage, same `stage`/`progress`/`hints` shape. `403 FORBIDDEN` when the stage
is locked.

#### `POST /api/ctf/stages/:slug/hints`

Reveals the next hint.

```json
{ "hint": { "position": 1, "body": "..." }, "hintsUsed": 1, "hintCount": 3 }
```

`409 CONFLICT` when every hint is already revealed or the stage is solved.

#### `POST /api/ctf/stages/:slug/submit`

```json
{ "answer": "L404{...}" }
```

```json
{
  "correct": true,
  "stageSolved": true,
  "stageSlug": "louage-404-01",
  "nextStageUnlocked": true,
  "nextStagePosition": 2,
  "completedChain": false,
  "message": "Correct flag. The next stage is unlocked."
}
```

Replaying a solved stage returns the same success without a new solve.

| Status | Code | Meaning |
|---|---|---|
| 400 | `CTF_NOT_SOLVED` | Incorrect flag (attempt recorded) |
| 403 | `FORBIDDEN` | Stage is locked |
| 403 | `STAGE_NOT_PUBLISHED` | Stage is `draft`/`closed` |
| 409 | `STAGE_NOT_CONFIGURED` | Stage has no answer provisioned |
| 429 | `RATE_LIMITED` | More than 5 attempts per minute for this stage |

#### `GET /api/challenges/current`

`403 CTF_NOT_SOLVED` until every required stage is solved; then
`{ "unlocked": true, "challenge": null, "message": "..." }` because the main
brief is not published yet.

## Planned Endpoint Groups

From the LilTech specification. Groups below are **contract plans**, not commitments to shapes; each group's exact methods/paths will be documented here (and implemented in `libs/api-contracts`) when the module is built.

| Group | Purpose |
|---|---|
| Authentication | Login for `team` / `jury` / `admin` roles |
| Event state | Current phase, server time, countdowns |
| Registration | Team + participant registration |
| Check-in | QR badge scanning and eligibility |
| Participant data | Profiles and badge information |
| Mini-CTF | Flag submission (server-validated, rate-limited, attempt-logged) |
| Challenge | Briefs and resources for the unlocked track |
| Submissions | Team deliverables with deadline enforcement |
| Announcements | Live announcement feed |
| Admin teams | Team management |
| Admin CTF | CTF administration (no flags in public responses) |
| Admin challenges | Challenge management |
| Jury | Jury accounts, challenge scoping |
| Jury scoring | Score entry (own scores only) |
| Admin jury management | Jury assignment |
| Results publication | Podiums and final results |

## Change Process

1. Add or change the contract in `libs/api-contracts` (types + Zod schema).
2. Document it in this file.
3. Implement backend and frontend against the contract.
4. Contract changes require a PR that updates `libs/api-contracts`, `docs/api/`, and both apps consistently.
