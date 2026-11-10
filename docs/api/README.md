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

Current codes: `INTERNAL`, `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `RATE_LIMITED`, `CTF_NOT_SOLVED`.

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
