-- Mini-CTF launch instant. Existing rows keep NULL, which means "not launched
-- yet"; the server falls back to the phase transition that enters `live`.
ALTER TABLE "event_phase_state" ADD COLUMN "ctfStartedAt" TIMESTAMP(3);

-- Automatic Mini-CTF score and the (still unused) jury score slots.
ALTER TABLE "teams"
  ADD COLUMN "ctfSolvedAt" TIMESTAMP(3),
  ADD COLUMN "ctfPoints" DOUBLE PRECISION,
  ADD COLUMN "c1JuryScore" DOUBLE PRECISION,
  ADD COLUMN "c2JuryScore" DOUBLE PRECISION;

-- Per-challenge submission cutoff and the administrative force-open override.
ALTER TABLE "challenges"
  ADD COLUMN "submissionDeadline" TIMESTAMP(3),
  ADD COLUMN "forceOpenedAt" TIMESTAMP(3);

-- Append-only submission history: the newest row per team and challenge counts.
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "driveUrl" VARCHAR(2000),
    "githubUrl" VARCHAR(2000),
    "reportUrl" VARCHAR(2000),
    "presentationUrl" VARCHAR(2000),
    "commitSha" VARCHAR(64),
    "submittedByUserId" UUID NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "submissions_teamId_challengeId_submittedAt_idx"
  ON "submissions"("teamId", "challengeId", "submittedAt");

CREATE INDEX "submissions_challengeId_idx" ON "submissions"("challengeId");

ALTER TABLE "submissions"
  ADD CONSTRAINT "submissions_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "submissions"
  ADD CONSTRAINT "submissions_challengeId_fkey"
  FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "submissions"
  ADD CONSTRAINT "submissions_submittedByUserId_fkey"
  FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
