-- CreateEnum
CREATE TYPE "ctf_stage_state" AS ENUM ('locked', 'unlocked', 'solved');

-- AlterTable
ALTER TABLE "ctf_progress" ADD COLUMN     "state" "ctf_stage_state" NOT NULL DEFAULT 'locked';

-- AlterTable
ALTER TABLE "ctf_stages" ADD COLUMN     "assetDriveUrl" VARCHAR(300),
ADD COLUMN     "requiredForUnlock" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "answerHash" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ctf_progress_teamId_state_idx" ON "ctf_progress"("teamId", "state");

-- A live stage must always carry an answer digest; draft stages may be
-- provisioned later. Enforced in the database so no code path can publish a
-- solvable stage without an answer.
ALTER TABLE "ctf_stages"
  ADD CONSTRAINT "ctf_stages_live_requires_answer"
  CHECK ("status" <> 'live' OR "answerHash" IS NOT NULL);

-- Backfill the sequential chain for teams that solved a stage before the chain
-- existed: the solved stage becomes `solved`, and the next stage (when seeded)
-- becomes `unlocked` so nobody loses progress. Attempts and hints are untouched.
UPDATE "ctf_progress" SET "state" = 'solved' WHERE "solvedAt" IS NOT NULL;

INSERT INTO "ctf_progress" ("id", "teamId", "stageId", "state")
SELECT gen_random_uuid(), p."teamId", nxt."id", 'unlocked'
FROM "ctf_progress" p
JOIN "ctf_stages" cur ON cur."id" = p."stageId"
JOIN "ctf_stages" nxt ON nxt."position" = cur."position" + 1
WHERE p."solvedAt" IS NOT NULL
ON CONFLICT ("teamId", "stageId") DO UPDATE
  SET "state" = 'unlocked'
  WHERE "ctf_progress"."state" = 'locked';
