# LOUAGE 404 — Mini-CTF operations guide

The Mini-CTF is a seven-stage, strictly sequential investigation. A team cannot
see or submit stage N+1 until it has solved stage N, and the main challenge
stays locked until every required stage is solved.

The admin event phase is the only runtime switch. Checked-in teams receive
access only while the phase is exactly `live`; `registration`, `checkin`,
`submissions_closed`, `pitching`, and `results` expose no stage and accept no
hints or answers. Moving the event to `live` in the admin control panel opens
the chain, and moving it to `submissions_closed` closes it immediately.

Nothing in this guide belongs in the browser: answers are only ever stored as
HMAC-SHA256 digests, and the pepper lives in the server environment.

## Stages

| # | Slug | Title | Status | Why |
|---|---|---|---|---|
| 01 | `louage-404-01` | The Louage | live | Organizer answer supplied |
| 02 | `louage-404-02` | The Location | live | Organizer answer supplied |
| 03 | `louage-404-03` | The Departure | live | Organizer answer supplied |
| 04 | `louage-404-04` | The Invisible Message | live | Organizer answer supplied |
| 05 | `louage-404-05` | The Two Signatures | live | Organizer answer supplied |
| 06 | `louage-404-06` | The Proverb | live | Organizer answer supplied |
| 07 | `louage-404-07` | The Final Passenger | live | Organizer answer supplied |

The chain is fully published: every stage carries an answer digest, so
teams can walk 01 → 07 without an organizer unlocking anything by hand. A
stage may still be parked in `draft` (answer `NULL`); it then answers
`403 STAGE_NOT_PUBLISHED` on submit and stops the chain, which is the
intended state for any stage whose answer is not confirmed.

## Models

- `CtfStage` — `slug`, `position` (both unique), `title`, `description`, `status`
  (`draft`/`live`/`closed`), `answerHash` (HMAC digest, `NULL` until
  provisioned), `assetDriveUrl`, `requiredForUnlock`.
  A database `CHECK` constraint refuses a `live` stage with a `NULL` answer.
- `CtfHint` — 3 progressive hints per stage, unique per `(stageId, position)`.
- `CtfProgress` — per team per stage: `state` (`locked`/`unlocked`/`solved`),
  `attempts`, `hintsUsed`, `solvedAt`. Unique per `(teamId, stageId)`.
- `CtfAttempt` — append-only log of `correct` / `incorrect` / `rate_limited`.
  The submitted text is never stored.

Solving stage N writes, in one transaction: the solve (guarded so only one
concurrent submission can claim it), the unlock row for stage N+1, the attempt,
and a `ctf.stage_solved` audit row. Replays return the same result and create
nothing new.

## Answer hashing

```
digest = HMAC-SHA256(normalizeAnswer(input), CTF_ANSWER_PEPPER)
```

`normalizeAnswer` applies Unicode NFC, trims, unwraps a `PREFIX{…}` wrapper,
lowercases, drops whitespace and separators, and **keeps apostrophes** so
`you're` never equals `youre`. Comparison is constant-time.

`CTF_ANSWER_PEPPER` must be at least 32 characters and must never be committed,
logged, or sent to the browser. Rotating it requires re-provisioning every
answer, because existing digests become unverifiable.

## Provisioning

Answers and Drive links are supplied through a private JSON file that is never
committed (default `apps/api/prisma/ctf-answers.json`, override with
`CTF_PROVISION_FILE`):

```json
{
  "stages": {
    "louage-404-01": {
      "answer": "L404{...}",
      "assetDriveUrl": "https://drive.google.com/drive/folders/..."
    }
  }
}
```

```bash
# 1. export the pepper and the provisioning file path
# 2. apply migrations, then provision
pnpm nx run api:db-migrate
pnpm nx run api:db-provision-ctf
```

The script is idempotent: stages and hints are upserted by slug/position, and
it never prints an answer. It refuses to publish (`status: "live"`) a stage
without an answer, and rejects any Drive URL that is not `https` on
`drive.google.com` or `docs.google.com`.

Production provisioning is deliberately separate from ordinary deployments.
The private file lives at `/opt/liltech/secrets/ctf-answers.json` on the VPS and
is mounted as a read-only Compose secret. An operator runs the profile once:

```bash
cd /opt/liltech
docker compose -f docker-compose.prod.yml --profile ctf-operations run --rm ctf-provision
```

The normal `docker compose up` path never starts this service.

Without SSH access, use the **Provision Mini-CTF** workflow
(`.github/workflows/ctf-provision.yml`, manual "Run workflow" only). It reads
the complete answers file from the `CTF_ANSWERS_JSON` repository secret, streams
it to `/opt/liltech/secrets/ctf-answers.json` (directory `700`, file `600`) and
runs the same Compose service. Update the secret, then re-run the workflow:

```bash
gh secret set CTF_ANSWERS_JSON --repo mohamedx2/liltech < ctf-answers.json
gh workflow run ctf-provision.yml --repo mohamedx2/liltech
```

Compose mounts the secret with the host file's owner and mode, so the one-shot
container runs as the deploy user (`--user "$(id -u):$(id -g)"`); the image's
`appuser` cannot read a `600` file it does not own. Do the same when running the
command above by hand.

Stage content (titles, descriptions, hints) lives in
`apps/api/prisma/ctf/stages.content.ts` and contains no answers.

## Google Drive resources

The platform does not host challenge assets. Each stage carries a Drive folder
URL, rendered as an "Open Google Drive" link with `target="_blank"` and
`rel="noopener noreferrer nofollow"`. A missing URL renders an explanatory
note instead of a broken link. Add or change it by re-provisioning that slug.

## Hints, attempts and rate limits

- Hints are revealed one at a time (`POST /api/ctf/stages/:slug/hints`); only
  revealed hints are ever serialized.
- Submissions are rate limited to **5 per minute per team per stage**. Per-stage
  windows keep guessing hostile without punishing a team that solves several
  stages in a row.

## Admin board

**Admin → Mini-CTF** (`/admin/ctf`, `GET /api/admin/ctf`) is the read-only
event-night view: the server clock and countdown, every stage with its status and
whether an answer is configured, and each team's current stage, attempts, hints,
solve time and points. It flags required stages that are draft or have no answer,
because they stop every team at that stage. It never shows answers or digests;
answers change only through provisioning. Early access stays on each team's page.

## Main challenge

`GET /api/challenges/current` returns `403 CTF_NOT_SOLVED` until every stage
with `requiredForUnlock = true` is solved. The team's `progressState` then
becomes `challenge_unlocked`. The server checks this independently of the UI.

## Testing the chain

```bash
# unit tests: normalization, hashing, Drive URL policy
pnpm --filter api exec vitest run src/modules/ctf

# integration tests (needs a provisioned test database)
TEST_DATABASE_URL=... DATABASE_URL=... CTF_ANSWER_PEPPER=... \
  pnpm --filter api exec vitest run src/tests/ctf.integration.spec.ts

# frontend states
pnpm nx run web:test
```

In CI, `TEST_DATABASE_URL` is mandatory: `INTEGRATION_DB_AVAILABLE()` throws
instead of silently skipping the database-backed suites.

## Manual playtest

1. Register a team and have staff scan its badges (or set
   `progressState = 'checked_in'` on a dev database).
2. Before launch, open `/team/ctf`: the API must return `EVENT_NOT_LIVE` and
   create no progress row.
3. From the admin control panel, select **Start event & open Mini-CTF** and
   confirm; stage 01 must become current and stages 02–07 remain locked.
4. Submit a wrong flag: an "Incorrect flag" alert, attempt counter +1, no unlock.
5. Reveal a hint: exactly one hint appears, counter +1.
6. Submit the correct stage 01 flag: the tracker marks 01 solved and stage 02
   becomes current.
6. Complete 01–04: stage 05 appears as "Not published yet" with the input
   disabled, and `/api/challenges/current` still returns `403 CTF_NOT_SOLVED`.
