-- Sprint 5 — Differentiator #1: incident collaboration
-- Adds acknowledge state on incidents and kind/author/mentions on incident_updates.

-- 1. New enum for incident update kinds.
DO $$ BEGIN
  CREATE TYPE "public"."incident_update_kind" AS ENUM('status', 'comment', 'system');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Acknowledge state on incidents.
ALTER TABLE "incidents"
  ADD COLUMN IF NOT EXISTS "acknowledged_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "acknowledged_by_user_id" uuid;

DO $$ BEGIN
  ALTER TABLE "incidents"
    ADD CONSTRAINT "incidents_acknowledged_by_user_id_users_id_fk"
    FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Kind / author / mentions on incident_updates.
ALTER TABLE "incident_updates"
  ADD COLUMN IF NOT EXISTS "kind" "incident_update_kind" DEFAULT 'status' NOT NULL,
  ADD COLUMN IF NOT EXISTS "authored_by_user_id" uuid,
  ADD COLUMN IF NOT EXISTS "mentions" uuid[] DEFAULT '{}'::uuid[] NOT NULL;

DO $$ BEGIN
  ALTER TABLE "incident_updates"
    ADD CONSTRAINT "incident_updates_authored_by_user_id_users_id_fk"
    FOREIGN KEY ("authored_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
