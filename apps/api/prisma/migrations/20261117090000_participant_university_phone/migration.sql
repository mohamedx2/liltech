-- University and mobile number of each participant. Nullable: teams registered
-- before these fields existed keep NULL; new registrations require both.
ALTER TABLE "participants" ADD COLUMN "university" VARCHAR(120),
ADD COLUMN "phone" VARCHAR(20);
