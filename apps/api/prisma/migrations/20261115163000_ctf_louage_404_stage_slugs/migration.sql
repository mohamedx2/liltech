-- The single-stage gate used the slug `louage-404`. The seven-stage chain uses
-- `louage-404-01` … `louage-404-07`. Rename in place so the existing stage row
-- (and any progress pointing at it) is preserved rather than duplicated.
UPDATE "ctf_stages"
SET "slug" = 'louage-404-01'
WHERE "slug" = 'louage-404'
  AND NOT EXISTS (SELECT 1 FROM "ctf_stages" AS other WHERE other."slug" = 'louage-404-01');
