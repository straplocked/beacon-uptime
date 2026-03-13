-- Step 1: Create member_role enum
DO $$ BEGIN
  CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Step 2: Create organizations table
CREATE TABLE IF NOT EXISTS "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "plan" "plan" DEFAULT 'free' NOT NULL,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "api_key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
  CONSTRAINT "organizations_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_idx" ON "organizations" USING btree ("slug");
--> statement-breakpoint

-- Step 3: Create organization_members table
CREATE TABLE IF NOT EXISTS "organization_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "member_role" DEFAULT 'member' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "org_member_unique" UNIQUE("organization_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_members_org_id_idx" ON "organization_members" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_members_user_id_idx" ON "organization_members" USING btree ("user_id");
--> statement-breakpoint

-- Step 4: Create organization_invitations table
CREATE TABLE IF NOT EXISTS "organization_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" "member_role" DEFAULT 'member' NOT NULL,
  "token" text NOT NULL,
  "invited_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "organization_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_invitations_org_id_idx" ON "organization_invitations" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_invitations_token_idx" ON "organization_invitations" USING btree ("token");
--> statement-breakpoint

-- Step 5: Add nullable organization_id + created_by_user_id to resource tables
ALTER TABLE "monitors" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "created_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "status_pages" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "status_pages" ADD COLUMN "created_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "created_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "created_by_user_id" uuid;
--> statement-breakpoint

-- Step 6: Data migration - create personal org for each existing user
INSERT INTO "organizations" ("id", "name", "slug", "plan", "stripe_customer_id", "stripe_subscription_id", "api_key", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  u."name" || '''s Organization',
  LOWER(REPLACE(u."email", '@', '-at-')),
  u."plan",
  u."stripe_customer_id",
  u."stripe_subscription_id",
  u."api_key",
  u."created_at",
  NOW()
FROM "users" u;
--> statement-breakpoint

-- Step 7: Create owner memberships
INSERT INTO "organization_members" ("organization_id", "user_id", "role")
SELECT o."id", u."id", 'owner'
FROM "users" u
JOIN "organizations" o ON o."slug" = LOWER(REPLACE(u."email", '@', '-at-'));
--> statement-breakpoint

-- Step 8: Backfill organization_id + created_by_user_id on resources
UPDATE "monitors" m
SET "organization_id" = o."id", "created_by_user_id" = m."user_id"
FROM "organizations" o
JOIN "users" u ON o."slug" = LOWER(REPLACE(u."email", '@', '-at-'))
WHERE m."user_id" = u."id";
--> statement-breakpoint

UPDATE "status_pages" sp
SET "organization_id" = o."id", "created_by_user_id" = sp."user_id"
FROM "organizations" o
JOIN "users" u ON o."slug" = LOWER(REPLACE(u."email", '@', '-at-'))
WHERE sp."user_id" = u."id";
--> statement-breakpoint

UPDATE "incidents" i
SET "organization_id" = o."id", "created_by_user_id" = i."user_id"
FROM "organizations" o
JOIN "users" u ON o."slug" = LOWER(REPLACE(u."email", '@', '-at-'))
WHERE i."user_id" = u."id";
--> statement-breakpoint

UPDATE "notification_channels" nc
SET "organization_id" = o."id", "created_by_user_id" = nc."user_id"
FROM "organizations" o
JOIN "users" u ON o."slug" = LOWER(REPLACE(u."email", '@', '-at-'))
WHERE nc."user_id" = u."id";
--> statement-breakpoint

-- Step 9: Make organization_id NOT NULL + add FKs
ALTER TABLE "monitors" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "status_pages" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "status_pages" ADD CONSTRAINT "status_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "status_pages" ADD CONSTRAINT "status_pages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "incidents" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

ALTER TABLE "notification_channels" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- Step 10: Drop old user_id columns and their FKs/indexes
DROP INDEX IF EXISTS "monitors_user_id_idx";
--> statement-breakpoint
ALTER TABLE "monitors" DROP CONSTRAINT IF EXISTS "monitors_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "monitors" DROP COLUMN "user_id";
--> statement-breakpoint

DROP INDEX IF EXISTS "status_pages_user_id_idx";
--> statement-breakpoint
ALTER TABLE "status_pages" DROP CONSTRAINT IF EXISTS "status_pages_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "status_pages" DROP COLUMN "user_id";
--> statement-breakpoint

DROP INDEX IF EXISTS "incidents_user_id_idx";
--> statement-breakpoint
ALTER TABLE "incidents" DROP CONSTRAINT IF EXISTS "incidents_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "incidents" DROP COLUMN "user_id";
--> statement-breakpoint

DROP INDEX IF EXISTS "notification_channels_user_id_idx";
--> statement-breakpoint
ALTER TABLE "notification_channels" DROP CONSTRAINT IF EXISTS "notification_channels_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "notification_channels" DROP COLUMN "user_id";
--> statement-breakpoint

-- Step 11: Drop old user-level plan/billing/apiKey columns
ALTER TABLE "users" DROP COLUMN IF EXISTS "plan";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "stripe_customer_id";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "stripe_subscription_id";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_api_key_unique";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN IF EXISTS "api_key";
--> statement-breakpoint

-- Step 12: Create new indexes
CREATE INDEX IF NOT EXISTS "monitors_org_id_idx" ON "monitors" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitors_created_by_idx" ON "monitors" USING btree ("created_by_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "status_pages_org_id_idx" ON "status_pages" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_org_id_idx" ON "incidents" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notification_channels_org_id_idx" ON "notification_channels" USING btree ("organization_id");
