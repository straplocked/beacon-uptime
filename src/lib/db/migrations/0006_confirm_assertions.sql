-- E5 (Vikunja 595) — retry and confirmation policy before opening an incident.
-- E4 (Vikunja 594) — HTTP keyword / body / header / JSON-path assertions.
--
-- confirmation_count is backfilled to 1 on existing rows so a single failed
-- check still flips a monitor to down immediately (today's behaviour is
-- preserved); the column default is then flipped to 2 so *new* monitors
-- require two consecutive failures before opening an incident. See
-- src/lib/monitoring/limits.ts for the full rationale.

ALTER TABLE "monitors"
  ADD COLUMN IF NOT EXISTS "confirmation_count" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "consecutive_failures" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "retry_interval_seconds" integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "next_check_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "assertions" jsonb;

-- Existing rows are already backfilled to 1 above; only now do we flip the
-- default so newly-created monitors get the confirmed-by-default value (2).
ALTER TABLE "monitors"
  ALTER COLUMN "confirmation_count" SET DEFAULT 2;
