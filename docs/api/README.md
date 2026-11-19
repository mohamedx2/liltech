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

Public. Returns the current phase, when it was entered, the authoritative server time (used by clients for countdowns) and the Mini-CTF clock.

**Response `200`:**

```json
{
  "phase": "registration|checkin|...",
  "phaseChangedAt": "ISO 8601 UTC",
  "serverTime": "ISO 8601 UTC",
  "ctfStartedAt": "ISO 8601 UTC | null",
  "ctfClosesAt": "ISO 8601 UTC | null"
}
```

`ctfStartedAt` is written once, when the event first enters `live`; `ctfClosesAt` is that instant + 60 minutes. Both are `null` before the launch and are never reset by a forced phase change.

Schema: `eventStateResponseSchema`.

#### `POST /api/event-state`

Phases advance one step at a time (`registration → checkin → live → submissions_closed → pitching → results`). Skipping ahead or going back needs `{ "phase": "…", "force": true }`; the audit entry records `from -> to` and marks overrides. The admin dashboard sends `force` only after the admin confirms.

Repeating the current phase is an idempotent no-op: `200` with the unchanged state and no audit entry. One exception: posting `live` while `ctfStartedAt` is still `null` records the Mini-CTF launch (audit `ctf.launched`).

Admin only. Atomically transitions the phase and records an audit entry `event.phase_changed`.

**Request body:** `{ "phase": "checkin|live|..." }`

**Response `200`:** the new event state shape (same as GET). Errors: `CONFLICT` when jumping or going back without `force`; `FORBIDDEN` for non-admin.

Schema: `updateEventStateRequestSchema` / `eventStateResponseSchema`.

### Registration

#### `POST /api/registration/teams`

Public. Registers a team of 4–7 members (leader + 3–6 members). Creates the shared team account (leader email + password ≥ 12 chars, bcrypt) plus participant records. Every participant (leader included) needs an email, unique within the team (case-insensitive), a `university` (2–120 characters) and a mobile `phone` (digits with optional `+`, spaces, dashes or parentheses; 8–15 digits) → otherwise `VALIDATION_ERROR` (400) with the field path, e.g. `members.2.phone`. Teams registered before university and phone were required keep `null` for both.

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
  "leader": { "name": "string", "email": "string", "university": "string", "phone": "string", "password": "string (≥12)" },
  "members": [ { "name": "string", "email": "string", "university": "string", "phone": "string" } ]
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

Challenge 01 unlocks early for a team that cleared the Mini-CTF chain (`access: "early"`) and to every team once `ctfStartedAt + 60 min` has passed, an administrator force-opens it, or `publicAt` is reached (`access: "public"`). Challenge 02 opens to everyone as soon as administrators start it. Otherwise `access` is `"locked"`, `content` is `null`, and `unlocksAt` carries the instant it opens to everyone (for the participant countdown).

Each view also reports `submissionOpen` (the server's answer to "may this team submit right now?"), `forcedOpen`, and the organizer-set `challenge.submissionDeadline`. Submissions stop when the event leaves `live`, when the challenge ends, or at the deadline. The phase gate lives in `apps/api/src/modules/event-state/phase-gate.ts` and is shared by the CTF, challenge and submission modules.

#### `GET /api/challenges` · `GET /api/challenges/current` (team)

Before the event (`registration`, `checkin`): `200 { available: false, reason: "EVENT_NOT_STARTED", phase, message }`. A team with no member checked in at the entrance: `reason: "NOT_CHECKED_IN"` (challenges are for teams present at the venue). Live with no challenge started yet: `current` answers `reason: "NO_CHALLENGE_STARTED"`. Otherwise `{ available: true, phase, serverTime, items | current }` where each view is `{ challenge (schedule), access, ctfSolved, content | null }`. `current` is the running challenge, else the last ended one. Each item is `{ challenge (schedule incl. submissionDeadline), access, ctfSolved, unlocksAt, forcedOpen, submissionOpen, content | null }`. Schemas: `teamChallengeListResponseSchema`, `currentChallengeResponseSchema`.

#### Admin (audited)

- `GET /api/admin/challenges` — full content, status, timing, Mini-CTF solve count.
- `POST /api/admin/challenges` — `{ position, title, summary?, description, problemStatement?, deliverables?, resources?: [{ name, url }], publicDelayMinutes? }`; duplicate position → 409.
- `PATCH /api/admin/challenges/:id` — content, delay (a delay change moves `publicAt` of a running challenge) and `submissionDeadline` (`null` clears it).
- `POST /api/admin/challenges/:id/start`, `POST /api/admin/challenges/:id/end` — event must be `live`.
- `POST /api/admin/challenges/:id/force-open` — opens a started challenge to every checked-in team now (idempotent, audited `challenge.force_opened`); 409 while the challenge is still `upcoming`.

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

#### `DELETE /api/announcements/:announcementId`

Admin only. Removes a wrong or outdated announcement from every feed. `204`; unknown id → 404. Audited as `announcement.deleted`.

Schema: `createAnnouncementRequestSchema` / `announcementSchema` / `announcementIdParamsSchema`.

Note: real-time delivery transport is pending (OPEN_QUESTIONS #7); clients may poll with the server-provided timestamps until then.

### Audit log

#### `GET /api/admin/audit-log`

Admin only, offset-paginated (limit 1–100, default 50; offset ≥ 0), newest first. Optional `action` query filters by action prefix (e.g. `team.`, `checkin.`, `ctf.`). Returns sensitive administrative actions recorded server-side with their target type and id (actions include `event.phase_changed`, `checkin.scan`, `checkin.manual`, `checkin.undone`, `checkin.badge_revoked`, `badge.reissued`, `badge.email_resent`, `badge.email_bulk_resent`, `team.renamed`, `team.status_changed`, `team.password_reset`, `team.deleted`, `participant.added|updated|removed`, `ctf.solve_granted|revoked`, `challenge.*`, `jury.*`, `announcement.published|deleted`, `registration.team_created`).

**Response `200`:** `{ items: [{ id, action, actorName, targetType?, targetId?, createdAt }], total }`.

Schema: `auditLogListRequestSchema` / `auditLogEntrySchema` list.

### Mini-CTF (LOUAGE 404)

Seven sequential stages. Every decision (which stage is current, whether a
submission is accepted, when the main challenge unlocks) is made server-side;
the client only renders `/ctf/chain`.

The CTF only runs while the event is `live` **and** within 60 minutes of the
launch instant the server recorded (`ctfStartedAt`). Before the launch every
action answers `403 CTF_NOT_OPEN`; after the window (or once the event reaches
`submissions_closed` or later) every action answers `403 CTF_CLOSED`.

All endpoints require `Authorization: Bearer <token>` with the `team` role.
They also require the authoritative event phase to be exactly `live`. An admin
opens the Mini-CTF by moving the event to `live`; every other phase returns
`403 EVENT_NOT_LIVE` without revealing stage data or recording a write.

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
  "eligible": true,
  "timing": {
    "startedAt": "2026-11-21T20:00:00.000Z",
    "closesAt": "2026-11-21T21:00:00.000Z",
    "open": true,
    "closed": false,
    "serverTime": "2026-11-21T20:10:00.000Z"
  }
}
```

`current` is `null` when the team has solved everything, is not eligible, or the
CTF is not open. `eligible` is false until the team has checked in; `timing.open`
is the server's answer to "can this team play right now?". `team.points` and
`team.solvedAt` are filled when the chain is completed. No answer, digest or
pepper is ever part of this payload.

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
  "points": null,
  "solvedAt": null,
  "message": "Correct flag. The next stage is unlocked."
}
```

Replaying a solved stage returns the same success without a new solve. The final
correct flag sets `completedChain: true` and fills `points` / `solvedAt`:

| Solve time since the launch | Points |
|---|---|
| `0 ≤ t < 15 min` | 10 |
| `15 ≤ t < 30 min` | 7 |
| `30 ≤ t < 45 min` | 4.5 |
| `45 ≤ t < 60 min` | 2.5 |
| `t ≥ 60 min` (window closed) | 0 |

Bands live in `apps/api/src/modules/ctf/ctf-scoring.ts`. The score and solve
instant are stored on the team (`ctfPoints`, `ctfSolvedAt`) and made permanent
when the chain completes; a replay never changes them.

| Status | Code | Meaning |
|---|---|---|
| 400 | `CTF_NOT_SOLVED` | Incorrect flag (attempt recorded) |
| 403 | `CTF_NOT_OPEN` | Event not `live`, or the launch instant not recorded |
| 403 | `CTF_CLOSED` | 60-minute window over, or event left `live` |
| 403 | `FORBIDDEN` | Stage is locked |
| 403 | `STAGE_NOT_PUBLISHED` | Stage is `draft`/`closed` |
| 409 | `STAGE_NOT_CONFIGURED` | Stage has no answer provisioned |
| 429 | `RATE_LIMITED` | More than `CTF_SUBMIT_RATE_LIMIT_PER_MINUTE` (5) attempts per minute for this stage |

#### Interaction with the main challenge

The chain is the single source of truth for Mini-CTF completion: solving the
last required stage sets the team to `challenge_unlocked` and stores the
automatic score. `GET /api/challenges` and `GET /api/challenges/current` then
report Challenge 01 as `access: "early"`. Teams that did not solve it get it at
`ctfStartedAt + 60 min` (evaluated lazily on every request), or when an
administrator force-opens it. See the challenge section above.

---

### Team submissions

Team role only; a team only ever sees its own submissions (resolved from the
authenticated account, never from the request). Contract in
`libs/api-contracts/src/lib/submissions-contracts.ts`.

There is no file upload: Challenge 01 takes one Google Drive link (poster, logo,
teaser video); Challenge 02 takes a GitHub repository plus a technical report
link and a presentation link.

#### `GET /api/submissions`

```json
{
  "phase": "live",
  "serverTime": "ISO 8601 UTC",
  "items": [
    {
      "challenge": { "id": "…", "position": 1, "title": "…", "submissionDeadline": "ISO 8601 UTC | null", "…": "…" },
      "access": "locked|early|public",
      "canSubmit": true,
      "blockedReason": null,
      "current": { "id": "…", "driveUrl": "https://drive.google.com/…", "isCurrent": true, "…": "…" },
      "history": [ { "…": "newest first" } ]
    }
  ]
}
```

`blockedReason` is one of `EVENT_NOT_LIVE`, `CHALLENGE_NOT_STARTED`,
`CHALLENGE_LOCKED`, `SUBMISSIONS_CLOSED`, `DEADLINE_PASSED`. Schema:
`submissionsOverviewResponseSchema`.

#### `POST /api/submissions`

```json
{ "challengePosition": 1, "driveUrl": "https://drive.google.com/…" }
```

```json
{
  "challengePosition": 2,
  "githubUrl": "https://github.com/owner/repo",
  "reportUrl": "https://drive.google.com/…",
  "presentationUrl": "https://docs.google.com/presentation/…"
}
```

Links are validated server-side: https only, no embedded credentials, Drive/Docs
hosts for the Drive fields, and `https://github.com/<owner>/<repo>` for the
repository. Anything else is `400 VALIDATION_ERROR`. Resubmission is allowed
until the deadline; every submission inserts an append-only row and the newest
one counts. For Challenge 02 the server also pins the GitHub default-branch HEAD
(`commitSha`) on a best-effort basis: if the GitHub API fails, times out or rate
limits, the submission is still accepted with `commitSha: null`.

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Malformed link or payload |
| 403 | `CHALLENGE_LOCKED` | Challenge not started / not unlocked for this team |
| 403 | `SUBMISSIONS_CLOSED` | Event not `live`, challenge ended, or deadline passed |

Audit entry `submission.created` (target: the challenge).

---

### Admin operations toolkit

Admin only; contract in `libs/api-contracts/src/lib/admin-operations-contracts.ts`. These are the fixes organizers apply on event night. Every write is audited in the same transaction as the change, and team/participant writes respond with the refreshed `AdminTeam`.

#### `GET /api/admin/overview`

Situation board aggregates: phase, team counts by standing and progress, check-in coverage (fully / partially / not checked in, per badge color), badge email delivery (sent / pending / failed / missing email), revoked badges, challenge timing with Mini-CTF solve counts, jury account and announcement counts. Schema: `adminOverviewResponseSchema`.

#### `GET /api/admin/teams`, `GET /api/admin/teams/:teamId`

Roster (newest first) / one team: standing (`status`, `statusReason`, `statusChangedAt`), progress, leader account email (the team login), every participant with email, `university` and `phone` (`null` for teams registered before both were required), badge color, check-in time and the staff member who recorded it, badge state (`issuedAt`, `revokedAt`, `emailStatus`, `emailLastSentAt` — never the token), and Mini-CTF solves. Schemas: `adminTeamListResponseSchema` / `adminTeamSchema`.

#### Team tools

| Endpoint | Body | Rules |
|---|---|---|
| `PATCH /api/admin/teams/:teamId` | `{ name }` | 3–60 chars; taken name → 409. Audit `team.renamed`. |
| `POST /api/admin/teams/:teamId/status` | `{ status: active\|withdrawn\|disqualified, reason? }` | Reason required unless `active`. A non-active team cannot be checked in (scan → 403, manual → 409) and gets 403 on `/api/challenges*`. Reversible. Audit `team.status_changed`. |
| `POST /api/admin/teams/:teamId/reset-password` | — | New 16-char password returned once (`temporaryPassword`, hash stored only); every session of the team account is revoked. Audit `team.password_reset`. |
| `DELETE /api/admin/teams/:teamId` | — | Only in phases `registration`/`checkin` (409 otherwise); deletes team, members, badges and team account. `204`. Audit `team.deleted`. |
| `POST /api/admin/teams/:teamId/participants` | `{ name, email, university, phone }` | Max 7 members (409); email unique across teams (409). Balanced badge color, new badge emailed in the background. `201`. Audit `participant.added`. |
| `POST /api/admin/teams/:teamId/ctf-solves` | `{ challengeId }` | Grants Mini-CTF early access (already granted → 409). `201`. Audit `ctf.solve_granted`. |
| `DELETE /api/admin/teams/:teamId/ctf-solves/:challengeId` | — | Withdraws it (none → 404). Audit `ctf.solve_revoked`. |

#### Participant tools

| Endpoint | Body | Rules |
|---|---|---|
| `PATCH /api/admin/participants/:participantId` | `{ name?, email?, university?, phone? }` | Email unique across teams (409). For the leader, the team login email/name change too. Audit `participant.updated`. |
| `DELETE /api/admin/participants/:participantId` | — | The leader cannot be removed (409). Audit `participant.removed`. |
| `POST /api/admin/participants/:participantId/check-in` | — | Manual check-in without QR (works with a revoked badge; team must be `active`); already checked in → 409. Audit `checkin.manual`. |
| `DELETE /api/admin/participants/:participantId/check-in` | — | Undo; a team with no check-in left goes back from `checked_in` to `registered`. Audit `checkin.undone`. |
| `POST /api/admin/participants/:participantId/reissue-badge` | — | New QR token (old one stops working, revocation lifted), emailed in the background → `{ participantId, issuedAt, emailQueued }`. Audit `badge.reissued`. |
| `POST /api/admin/badges/resend-failed` | — | Requeues every failed (or stuck > 10 min pending) badge email of a non-revoked badge → `{ queued }`. Audit `badge.email_bulk_resent`. |

Check-in no longer moves a team back to `checked_in` from a later progress state when a late member is scanned (scan and manual check-in both only advance from `registered`).

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

At every API start, badges issued before encrypted storage existed are reissued (the old code stops working; the new one shows on the team portal), participants without a badge get one, and both are queued as `pending` and emailed in the same run (participants with an email), together with any email left `pending` by a restart. Badge emails can also be sent one by one, or retried in bulk, from the admin Teams pages (`GET /api/admin/teams` returns each participant's `email` and `badge.emailStatus`). Team password resets are documented under "Admin operations toolkit".

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
| Admin CTF | CTF administration (no flags in public responses) |
| Jury | Jury accounts, challenge scoping |
| Jury scoring | Score entry (own scores only) |
| Admin jury management | Jury assignment |
| Results publication | Podiums and final results |

## Change Process

1. Add or change the contract in `libs/api-contracts` (types + Zod schema).
2. Document it in this file.
3. Implement backend and frontend against the contract.
4. Contract changes require a PR that updates `libs/api-contracts`, `docs/api/`, and both apps consistently.
