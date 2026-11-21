-- Administrator score overrides for the results board.
-- The unused `c1JuryScore` / `c2JuryScore` placeholders become the challenge
-- overrides (jury scores live in `jury_evaluations`), and the Mini-CTF gets an
-- override next to its automatic `ctfPoints`. NULL means "no override".
ALTER TABLE "teams" RENAME COLUMN "c1JuryScore" TO "c1ScoreOverride";
ALTER TABLE "teams" RENAME COLUMN "c2JuryScore" TO "c2ScoreOverride";
ALTER TABLE "teams" ADD COLUMN "ctfPointsOverride" DOUBLE PRECISION;

ALTER TABLE "teams" ADD CONSTRAINT "teams_score_overrides_range" CHECK (
  ("ctfPointsOverride" IS NULL OR "ctfPointsOverride" BETWEEN 0 AND 10)
  AND ("c1ScoreOverride" IS NULL OR "c1ScoreOverride" BETWEEN 0 AND 100)
  AND ("c2ScoreOverride" IS NULL OR "c2ScoreOverride" BETWEEN 0 AND 100)
);
