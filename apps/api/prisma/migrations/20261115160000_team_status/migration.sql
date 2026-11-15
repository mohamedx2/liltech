-- CreateEnum
CREATE TYPE "team_status" AS ENUM ('active', 'withdrawn', 'disqualified');

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "status" "team_status" NOT NULL DEFAULT 'active',
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusReason" VARCHAR(300);

-- CreateIndex
CREATE INDEX "teams_status_idx" ON "teams"("status");
