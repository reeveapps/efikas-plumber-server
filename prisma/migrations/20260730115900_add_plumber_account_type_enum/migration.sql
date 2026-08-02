-- The 20260730120000_plumber_company_roster migration alters PlumberProfile to
-- use the PlumberAccountType enum, but no migration ever created that type — it
-- only worked previously because the type already existed out-of-band. This
-- creates it idempotently so a fresh database (e.g. Docker) can migrate cleanly
-- without breaking already-applied history where the type already exists.
DO $$ BEGIN
    CREATE TYPE "PlumberAccountType" AS ENUM ('INDIVIDUAL', 'COMPANY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
