# LOUAGE 404 — Mini-CTF operations guide

The Mini-CTF is a seven-stage, strictly sequential investigation. A team cannot
see or submit stage N+1 until it has solved stage N, and the main challenge
stays locked until every required stage is solved.

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

`CTF_ANSWER_PEPPER` must be at least 16 characters and must never be committed,
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
2. Open `/team/ctf`: stage 01 must be current, stages 02–07 locked.
3. Submit a wrong flag: an "Incorrect flag" alert, attempt counter +1, no unlock.
4. Reveal a hint: exactly one hint appears, counter +1.
5. Submit the correct stage 01 flag: the tracker marks 01 solved and stage 02
   becomes current.
6. Complete 01–04: stage 05 appears as "Not published yet" with the input
   disabled, and `/api/challenges/current` still returns `403 CTF_NOT_SOLVED`.
