-- CreateEnum
CREATE TYPE "challenge_status" AS ENUM ('upcoming', 'live', 'ended');

-- CreateTable
CREATE TABLE "challenges" (
    "id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "summary" VARCHAR(500) NOT NULL DEFAULT '',
    "description" TEXT NOT NULL,
    "problemStatement" TEXT NOT NULL DEFAULT '',
    "deliverables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resources" JSONB NOT NULL DEFAULT '[]',
    "publicDelayMinutes" INTEGER NOT NULL DEFAULT 60,
    "status" "challenge_status" NOT NULL DEFAULT 'upcoming',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "publicAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_ctf_solves" (
    "id" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "solvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_ctf_solves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "challenges_position_key" ON "challenges"("position");

-- CreateIndex
CREATE INDEX "challenges_status_idx" ON "challenges"("status");

-- CreateIndex
CREATE INDEX "challenge_ctf_solves_teamId_idx" ON "challenge_ctf_solves"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_ctf_solves_challengeId_teamId_key" ON "challenge_ctf_solves"("challengeId", "teamId");

-- AddForeignKey
ALTER TABLE "challenge_ctf_solves" ADD CONSTRAINT "challenge_ctf_solves_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_ctf_solves" ADD CONSTRAINT "challenge_ctf_solves_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- At most one challenge can be live at a time (final defense behind the
-- service check; not expressible in the Prisma schema).
CREATE UNIQUE INDEX "challenges_single_live" ON "challenges"("status") WHERE "status" = 'live';
