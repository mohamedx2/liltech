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

### Documentation & Spec

#### `GET /api/docs`

Interactive Swagger UI documentation. Renders complete OpenAPI 3.0 specs with executable API test console, authorization token persistence, and schema inspectors.

#### `GET /api/docs/openapi.json`

Machine-readable OpenAPI 3.0.3 specification in JSON format.

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

Phases advance one step at a time (`registration → checkin → live → submissions_closed → pitching → results`). Skipping ahead or going back needs `{ "phase": "…", "force": true }`; the audit entry records `from -> to` and marks overrides. The admin dashboard sends `force` only after the admin confirms.

Admin only. Atomically transitions the phase and records an audit entry (`event_phase_transition`).

**Request body:** `{ "phase": "checkin|live|..." }`

**Response `200`:** the new event state shape (same as GET). Errors: `CONFLICT` when the requested phase equals the current phase; `FORBIDDEN` for non-admin. Audit entry `event.phase_changed` recorded.

Schema: `updateEventStateRequestSchema` / `eventStateResponseSchema`.

### Registration

#### `POST /api/registration/teams`

Public. Registers a team of 4–7 members (leader + 3–6 members). Creates the shared team account (leader email + password ≥ 12 chars, bcrypt) plus participant records. Every participant needs an email, unique within the team (case-insensitive) → otherwise `VALIDATION_ERROR` (400).

Each participant gets one of four badge colors (`blue`, `red`, `yellow`, `green`): always the least used color so far, chosen inside a serializable transaction, so the four groups never differ by more than one. Each participant also gets one revocable QR badge; the token is stored as a SHA-256 hash (scan lookup) and AES-256-GCM encrypted under `QR_TOKEN_KEY` (so the team can display it again). After the transaction commits, each participant is emailed their own QR badge (Gmail SMTP); a delivery failure never fails the registration and is recorded per badge.

Conflicts → `CONFLICT` (409) with field-level `details` (`path` is the request field, e.g. `members.1.email`):

- a participant email already registered on **another team** (a person can only be on one team): message names the email(s);
- a leader email already used by an account;
- a team name already taken.

Malformed JSON → `VALIDATION_ERROR` (400), never a 500.

Registration is accepted while the event phase is `registration` or `checkin` (otherwise `CONFLICT` 409 "Registration is closed.") and is rate limited per client IP (`REGISTRATION_RATE_LIMIT_PER_HOUR`, 10 by default → `RATE_LIMITED` 429).

**Request body:**

```json
{
  "teamName": "string (3–60)",
  "leader": { "name": "string", "email": "string", "password": "string (≥12)" },
  "members": [ { "name": "string", "email": "string" } ]
}
```

**Response `201`:** `teamResponseSchema` (id, name, progressState `registered`, leader, participants) plus a `badges` array of `issueBadgeResponseSchema` (participantId, participantName, raw token, issuedAt).

Schema: `createTeamRequestSchema` / `teamRegistrationResponseSchema` (`teamResponseSchema` + `badges: issueBadgeResponseSchema[]`). The raw tokens are also returned once here; the team can read them again later through `GET /api/participants/badge`.

#### `GET /api/registration/teams/me`

Authenticated as `team`. Returns the authenticated team's own registration: participants with their check-in status (`checkedInAt` when checked in).

Schema: `participantSummarySchema` list wrapped in `teamResponseSchema`.

### Team portal

Team role only. The team is always the authenticated account's own team (`Team.leaderId`); no team id is ever accepted. The team account is shared: the leader gives its credentials to the members.

#### `GET /api/participants/team`

The team, its progress, and its members (`fullName`, `email`, `roleInTeam`, badge `color`, `isCheckedIn`). Schema: `teamPortalSummarySchema`.

#### `GET /api/participants/badge`

Every member's QR badge, so any member can show it on a phone at the entrance even if the email failed: `qrToken`, a PNG `qrImageDataUrl`, `color`, `isRevoked`, `isCheckedIn`, and the email state (`emailStatus` `pending|sent|failed`, `emailLastSentAt`, `emailResendAvailableAt`). Revoked badges, and badges issued before encrypted storage existed, have `qrToken: null`. Schema: `teamBadgesResponseSchema`.

#### `POST /api/participants/badge/:participantId/resend-email`

Resends one member's badge email, **at most once per hour per participant**. The limit is claimed atomically from the stored `emailLastSentAt`, so parallel clicks or a server restart cannot bypass it. Too soon → `RATE_LIMITED` (429) with `details.emailResendAvailableAt`. A participant of another team → `NOT_FOUND` (404). Revoked badge or no email → `CONFLICT` (409). A badge without a readable stored token is reissued (the old QR code stops working). Schema: `resendBadgeEmailResponseSchema`.

### Challenges

The event runs two challenges one after the other. An administrator starts and ends each one; both actions are refused (`CONFLICT`, 409) unless the event phase is `live`. Only one challenge can be live at a time (service check plus a partial unique index), challenges start in `position` order, and an ended challenge cannot start again. Starting sets `publicAt = startedAt + publicDelayMinutes` (60 by default).

A team reads a running challenge's description before `publicAt` only if it solved **that challenge's** Mini-CTF (`access: "early"`); from `publicAt`, or once the challenge has ended, every team can (`access: "public"`). Otherwise `access` is `"locked"` and `content` is `null` (title, teaser and `publicAt` stay visible). The Mini-CTF module records a solve with `recordMiniCtfSolve(teamId, challengeId)` (challenges service); that is the only integration point.

#### `GET /api/challenges` · `GET /api/challenges/current` (team)

Before the event (`registration`, `checkin`): `200 { available: false, reason: "EVENT_NOT_STARTED", phase, message }`. A team with no member checked in at the entrance: `reason: "NOT_CHECKED_IN"` (challenges are for teams present at the venue). Live with no challenge started yet: `current` answers `reason: "NO_CHALLENGE_STARTED"`. Otherwise `{ available: true, phase, serverTime, items | current }` where each view is `{ challenge (schedule), access, ctfSolved, content | null }`. `current` is the running challenge, else the last ended one. Schemas: `teamChallengeListResponseSchema`, `currentChallengeResponseSchema`.

#### Admin (audited)

- `GET /api/admin/challenges` — full content, status, timing, Mini-CTF solve count.
- `POST /api/admin/challenges` — `{ position, title, summary?, description, problemStatement?, deliverables?, resources?: [{ name, url }], publicDelayMinutes? }`; duplicate position → 409.
- `PATCH /api/admin/challenges/:id` — content and delay (a delay change moves `publicAt` of a running challenge).
- `POST /api/admin/challenges/:id/start`, `POST /api/admin/challenges/:id/end` — event must be `live`.

### Check-in (staff)

Admin-only endpoints. QR tokens are verified against their stored SHA-256 hash; raw token material is never echoed back for validation. Scan responses and the badge roster include the participant's badge `color`.

#### `POST /api/checkin/scan`

**Request body:** `{ "token": "<43-char base64url QR token>" }`

Records a single check-in for the badge's participant. **Response `200`:** `{ participant, team, checkedInAt }`. Errors: `NOT_FOUND` (unknown token), `FORBIDDEN` (revoked badge), `CONFLICT` (already checked in — unique constraint).

Schema: `scanCheckInRequestSchema` / `checkInResponseSchema`.

#### `POST /api/checkin/revoke`

**Request body:** `{ "token": "<43-char base64url QR token>" }`

Revokes a badge token (treated as a credential). Audit entry `checkin.badge_revoked` recorded.

**Response `204`**; `NOT_FOUND` when unknown.

#### `GET /api/checkin/badges`

Admin only. Returns the badge roster (participant name, team name, issuedAt, revokedAt?, checkedInAt?) for staff review.

**Response `200`:** `{ items: badgeSummarySchema[], total }`.

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

### Admin team roster

#### `GET /api/admin/teams`

Admin only. Full team roster, newest first: every team with its progress state, leader, and per-participant check-in state.

**Response `200`:** `{ items: TeamResponse[], total }`.

Schema: `adminTeamListResponseSchema` (reuses `teamResponseSchema`).

### Admin jury accounts

Admin only; every route is pinned to `role: 'jury'`, so a team or admin account id answers 404. Mutations are audited (`jury.created`, `jury.updated`, `jury.deleted`). By organizer decision, jury passwords are readable by administrators (see AGENTS.md §9); no other endpoint ever returns them.

#### `GET /api/admin/jury`

`{ items: [{ id, name, email, password, createdAt }], total }`, newest first. `password` is `null` for accounts created before readable passwords existed. Schema: `adminJuryListResponseSchema`.

#### `POST /api/admin/jury`

`{ name, email, password? }` (strict; password ≥ 12). Without `password` the server generates a 16-character one. `201` returns the account with its password. Email already used → `CONFLICT` (409). Schema: `createJuryAccountRequestSchema`.

#### `PATCH /api/admin/jury/:id`

Any of `{ name, email, password }` (at least one). A new password ends every existing session of that juror. Schema: `updateJuryAccountRequestSchema`.

#### `DELETE /api/admin/jury/:id`

`204`. Deletes the account; its sessions go with it.

At every API start, badges issued before encrypted storage existed are reissued (the old code stops working; the new one shows on the team portal), participants without a badge get one, and emails left `pending` by a restart are sent again. Badges that were never emailed are sent one by one from the admin Teams page (`GET /api/admin/teams` returns each participant's `email` and `badgeEmailStatus`).

#### `POST /api/admin/participants/:participantId/resend-badge-email`

Resends a participant's badge email without the hourly limit (audited as `badge.email_resent`).

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
