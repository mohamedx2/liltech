-- CreateEnum
CREATE TYPE "role" AS ENUM ('team', 'jury', 'admin');

-- CreateEnum
CREATE TYPE "team_progress" AS ENUM ('registered', 'checked_in', 'ctf_unlocked', 'ctf_solved', 'challenge_unlocked', 'submitted');

-- CreateEnum
CREATE TYPE "event_phase" AS ENUM ('registration', 'checkin', 'live', 'submissions_closed', 'pitching', 'results');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "role" "role" NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "leaderId" UUID NOT NULL,
    "progressState" "team_progress" NOT NULL DEFAULT 'registered',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "isLeader" BOOLEAN NOT NULL,
    "email" VARCHAR(254),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_tokens" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "qr_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in_records" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedByUserId" UUID NOT NULL,

    CONSTRAINT "check_in_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_phase_state" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "phase" "event_phase" NOT NULL DEFAULT 'registration',
    "phaseChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedByUserId" UUID,

    CONSTRAINT "event_phase_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "targetType" VARCHAR(50),
    "targetId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "teams_name_key" ON "teams"("name");

-- CreateIndex
CREATE UNIQUE INDEX "teams_leaderId_key" ON "teams"("leaderId");

-- CreateIndex
CREATE INDEX "teams_progressState_idx" ON "teams"("progressState");

-- CreateIndex
CREATE INDEX "participants_teamId_idx" ON "participants"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "qr_tokens_participantId_key" ON "qr_tokens"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "qr_tokens_tokenHash_key" ON "qr_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "check_in_records_participantId_key" ON "check_in_records"("participantId");

-- CreateIndex
CREATE INDEX "check_in_records_checkedInAt_idx" ON "check_in_records"("checkedInAt");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "announcements_publishedAt_idx" ON "announcements"("publishedAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_tokens" ADD CONSTRAINT "qr_tokens_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_records" ADD CONSTRAINT "check_in_records_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_records" ADD CONSTRAINT "check_in_records_checkedByUserId_fkey" FOREIGN KEY ("checkedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
