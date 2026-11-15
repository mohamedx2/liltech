-- CreateEnum
CREATE TYPE "badge_color" AS ENUM ('blue', 'red', 'yellow', 'green');

-- CreateEnum
CREATE TYPE "badge_email_status" AS ENUM ('pending', 'sent', 'failed');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "juryPlainPassword" VARCHAR(256);

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "color" "badge_color";

-- AlterTable
ALTER TABLE "qr_tokens" ADD COLUMN     "emailLastSentAt" TIMESTAMP(3),
ADD COLUMN     "emailStatus" "badge_email_status",
ADD COLUMN     "tokenCiphertext" VARCHAR(255);

-- CreateIndex
CREATE INDEX "participants_email_idx" ON "participants"("email");

-- CreateIndex
CREATE INDEX "participants_color_idx" ON "participants"("color");


-- Backfill: spread already-registered participants evenly across the four
-- badge colors, in registration order.
UPDATE "participants" AS p
SET "color" = (ARRAY['blue', 'red', 'yellow', 'green']::"badge_color"[])[((ordered.rn - 1) % 4) + 1]
FROM (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS rn
  FROM "participants"
) AS ordered
WHERE p."id" = ordered."id" AND p."color" IS NULL;
