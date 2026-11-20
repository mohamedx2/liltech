-- Jury scoring: each jury account is assigned one challenge, and each juror
-- stores their own scores per team and challenge. Additive only.

-- Challenge a jury account evaluates (NULL until an administrator assigns it).
ALTER TABLE "users" ADD COLUMN "juryChallengeId" UUID;

CREATE INDEX "users_juryChallengeId_idx" ON "users"("juryChallengeId");

ALTER TABLE "users"
  ADD CONSTRAINT "users_juryChallengeId_fkey"
  FOREIGN KEY ("juryChallengeId") REFERENCES "challenges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One juror's scores for one team on one challenge (0–25 per criterion).
CREATE TABLE "jury_evaluations" (
    "id" UUID NOT NULL,
    "juryUserId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "technicalExecution" INTEGER NOT NULL,
    "innovationOriginality" INTEGER NOT NULL,
    "uiUxDesign" INTEGER NOT NULL,
    "pitchPresentation" INTEGER NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jury_evaluations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "jury_evaluations_scores_range" CHECK (
      "technicalExecution" BETWEEN 0 AND 25
      AND "innovationOriginality" BETWEEN 0 AND 25
      AND "uiUxDesign" BETWEEN 0 AND 25
      AND "pitchPresentation" BETWEEN 0 AND 25
      AND "totalScore" = "technicalExecution" + "innovationOriginality" + "uiUxDesign" + "pitchPresentation"
    )
);

CREATE UNIQUE INDEX "jury_evaluations_juryUserId_teamId_challengeId_key"
  ON "jury_evaluations"("juryUserId", "teamId", "challengeId");

CREATE INDEX "jury_evaluations_challengeId_teamId_idx"
  ON "jury_evaluations"("challengeId", "teamId");

-- Deleting a juror who already scored is refused: scores are not lost silently.
ALTER TABLE "jury_evaluations"
  ADD CONSTRAINT "jury_evaluations_juryUserId_fkey"
  FOREIGN KEY ("juryUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "jury_evaluations"
  ADD CONSTRAINT "jury_evaluations_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "jury_evaluations"
  ADD CONSTRAINT "jury_evaluations_challengeId_fkey"
  FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
