# Database — LilTech 2026 Platform

PostgreSQL 17 accessed exclusively through Prisma ORM (`apps/api/prisma/schema.prisma`). Prisma client usage stays inside `apps/api` behind services; Prisma models never leak into public API responses.

## Schema

Single source of truth: `apps/api/prisma/schema.prisma`.

Core models (applied via migrations under `apps/api/prisma/migrations/`):

| Model | Purpose |
|---|---|
| `SystemSetting` | pre-existing minimal model (initial schema) |
| `User` | accounts for roles `team` / `jury` / `admin`; email + `passwordHash` |
| `Session` | opaque bearer sessions (token hash stored, expiresAt, revokedAt) |
| `Team` | 4–7 members, `progressState` (`registered → checked_in → ctf_unlocked → ctf_solved → challenge_unlocked → submitted`), leader FK, administrative `status` (`active` / `withdrawn` / `disqualified`) with `statusReason` and `statusChangedAt` |
| `Participant` | team member; one `QrToken` per participant |
| `QrToken` | raw token stored as SHA-256 hash only; unique per participant; revocable |
| `CheckInRecord` | who/when/by-whom; unique constraint per participant (single check-in) |
| `EventPhaseState` | single row (`id = 1`): current phase + `phaseChangedAt` + `openedBy` |
| `Announcement` | live feed (body, publishedAt, author FK) |
| `AuditLog` | sensitive admin actions (action enum, actor, target type/id) |

Enums: `Role`, `TeamProgressState`, `EventPhase`, `AuditAction` (latter stored as string).

## Migrations

Three migrations applied to both dev (`liltech`) and test (`liltech_test`) databases:

1. `20261110174519_init_schema` — initial `SystemSetting` model (pre-existing).
2. `20261110180113_registration_checkin_and_event_state_foundation` — User, Session, Team, Participant, QrToken, CheckInRecord, EventPhaseState, Announcement, AuditLog + enums, FKs, unique constraints, indexes.
3. `20261110205320_audit_target_id_varchar` — `AuditLog.targetId` widened from `Int` to `VarChar(50)` for UUID targets.
4. `20261115130000_badge_colors_email_delivery_jury_passwords` — badge colors, badge email delivery state, readable jury passwords.
5. `20261115140000_challenges_and_ctf_solves` — `Challenge`, `ChallengeCtfSolve`.
6. `20261115160000_team_status` — `Team.status` (`team_status` enum, default `active`), `statusReason`, `statusChangedAt`, index on `status`. A non-active team cannot be checked in or read challenges.
7. `20261115190000_audit_log_summary` — `AuditLog.summary`.
8. `20261117090000_participant_university_phone` — `Participant.university` (`VarChar(120)`) and `Participant.phone` (`VarChar(20)`). Nullable for participants registered before they existed; required by the registration and admin add-member contracts.

Commands (Windows notes: this Prisma version does not support `--env-file`; pass `DATABASE_URL` inline):

```powershell
# Create a new migration + apply to dev DB:
$env:DATABASE_URL='postgresql://liltech:local_dev_password@localhost:5433/liltech?schema=public'; pnpm nx run api:db-migrate --name <change>

# Apply pending migrations to dev DB:
pnpm nx run api:db-migrate

# Apply to test DB:
$env:DATABASE_URL='postgresql://liltech:local_dev_password@localhost:5433/liltech_test?schema=public'; pnpm nx run api:db-migrate

# Regenerate Prisma Client after schema edits:
pnpm nx run api:prisma-generate

# Validate schema:
pnpm --filter api exec prisma validate

# Seed (idempotent, metadata-only, no credentials/flags):
pnpm nx run api:db-seed
```

Rules:

- Never edit applied migrations; schema changes = new reviewed migration file.
- Every FK and uniqueness rule explicit; indexes on hot paths (session token hash, QrToken participantId, CheckInRecord participantId).
- `prisma migrate deploy` is used in CI against `liltech_test`.

## Constraints relevant to behavior

- `CheckInRecord.participantId` unique → a participant can only be checked in once (P2002 mapped to 409 CONFLICT).
- `QrToken.participantId` unique → one badge per participant.
- `Session.tokenHash` unique; `User.email` unique.
- Passwords hashed with bcrypt (cost 10) — never plaintext, never logged.

## Test database

Integration tests (`apps/api/src/tests/integration.spec.ts`) run against `liltech_test`, gated on `TEST_DATABASE_URL`. CI provisions `postgres:17-alpine` on port 5433, creates `liltech_test`, runs migrations, then tests.
