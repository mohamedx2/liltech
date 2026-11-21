-- Participation fee status, set one participant at a time by an organizer.
-- Additive and nullable: every existing participant starts unpaid (NULL).
ALTER TABLE "participants" ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "paidById" UUID;

-- The organizer who marked the payment; kept NULL if that account is deleted.
ALTER TABLE "participants"
  ADD CONSTRAINT "participants_paidById_fkey"
  FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
