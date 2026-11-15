-- CreateEnum
CREATE TYPE "ctf_stage_status" AS ENUM ('draft', 'live', 'closed');

-- CreateEnum
CREATE TYPE "ctf_outcome" AS ENUM ('correct', 'incorrect', 'rate_limited');

-- CreateTable
CREATE TABLE "ctf_stages" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(140) NOT NULL,
    "description" TEXT,
    "status" "ctf_stage_status" NOT NULL DEFAULT 'draft',
    "answerHash" VARCHAR(64) NOT NULL,
    "assetImageUrl" VARCHAR(300),
    "assetZipUrl" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ctf_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctf_hints" (
    "id" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "body" VARCHAR(300) NOT NULL,

    CONSTRAINT "ctf_hints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctf_progress" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "hintsUsed" INTEGER NOT NULL DEFAULT 0,
    "solvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ctf_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctf_attempts" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "outcome" "ctf_outcome" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ctf_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ctf_stages_slug_key" ON "ctf_stages"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ctf_stages_position_key" ON "ctf_stages"("position");

-- CreateIndex
CREATE UNIQUE INDEX "ctf_hints_stageId_position_key" ON "ctf_hints"("stageId", "position");

-- CreateIndex
CREATE INDEX "ctf_progress_stageId_solvedAt_idx" ON "ctf_progress"("stageId", "solvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ctf_progress_teamId_stageId_key" ON "ctf_progress"("teamId", "stageId");

-- CreateIndex
CREATE INDEX "ctf_attempts_teamId_createdAt_idx" ON "ctf_attempts"("teamId", "createdAt");

-- AddForeignKey
ALTER TABLE "ctf_hints" ADD CONSTRAINT "ctf_hints_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ctf_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctf_progress" ADD CONSTRAINT "ctf_progress_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctf_progress" ADD CONSTRAINT "ctf_progress_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ctf_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctf_attempts" ADD CONSTRAINT "ctf_attempts_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ctf_attempts" ADD CONSTRAINT "ctf_attempts_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ctf_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
