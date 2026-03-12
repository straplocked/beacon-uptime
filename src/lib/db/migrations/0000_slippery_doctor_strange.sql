CREATE TYPE "public"."check_status" AS ENUM('up', 'down', 'degraded');--> statement-breakpoint
CREATE TYPE "public"."http_method" AS ENUM('GET', 'POST', 'HEAD');--> statement-breakpoint
CREATE TYPE "public"."incident_impact" AS ENUM('none', 'minor', 'major', 'critical');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('investigating', 'identified', 'monitoring', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."monitor_status" AS ENUM('up', 'down', 'degraded', 'paused', 'pending');--> statement-breakpoint
CREATE TYPE "public"."monitor_type" AS ENUM('http', 'ping', 'tcp', 'dns', 'ssl', 'heartbeat');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('email', 'slack', 'discord', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'pro', 'team');--> statement-breakpoint
CREATE TABLE "check_results" (
	"time" timestamp with time zone DEFAULT now() NOT NULL,
	"monitor_id" uuid NOT NULL,
	"region" text DEFAULT 'us-east' NOT NULL,
	"status" "check_status" NOT NULL,
	"response_time_ms" integer,
	"status_code" integer,
	"error_message" text,
	"tls_expiry" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "incident_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"status" "incident_status" NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status_page_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "incident_status" DEFAULT 'investigating' NOT NULL,
	"impact" "incident_impact" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "monitor_type" NOT NULL,
	"target" text NOT NULL,
	"interval_seconds" integer DEFAULT 60 NOT NULL,
	"timeout_ms" integer DEFAULT 10000 NOT NULL,
	"expected_status_code" integer DEFAULT 200,
	"method" "http_method" DEFAULT 'GET',
	"headers" jsonb,
	"body" text,
	"regions" text[] DEFAULT '{"us-east"}' NOT NULL,
	"status" "monitor_status" DEFAULT 'pending' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"is_paused" boolean DEFAULT false NOT NULL,
	"heartbeat_token" text,
	"heartbeat_interval_seconds" integer,
	"last_heartbeat_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monitors_heartbeat_token_unique" UNIQUE("heartbeat_token")
);
--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "status_page_monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status_page_id" uuid NOT NULL,
	"monitor_id" uuid NOT NULL,
	"display_name" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"group_name" text
);
--> statement-breakpoint
CREATE TABLE "status_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"custom_domain" text,
	"logo_url" text,
	"favicon_url" text,
	"brand_color" text DEFAULT '#10b981' NOT NULL,
	"custom_css" text,
	"header_text" text,
	"footer_text" text,
	"show_uptime_percentage" boolean DEFAULT true NOT NULL,
	"show_response_time" boolean DEFAULT true NOT NULL,
	"show_history_days" integer DEFAULT 90 NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "status_pages_slug_unique" UNIQUE("slug"),
	CONSTRAINT "status_pages_custom_domain_unique" UNIQUE("custom_domain")
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status_page_id" uuid NOT NULL,
	"email" text NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"confirmation_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_status_page_id_status_pages_id_fk" FOREIGN KEY ("status_page_id") REFERENCES "public"."status_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_page_monitors" ADD CONSTRAINT "status_page_monitors_status_page_id_status_pages_id_fk" FOREIGN KEY ("status_page_id") REFERENCES "public"."status_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_page_monitors" ADD CONSTRAINT "status_page_monitors_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_pages" ADD CONSTRAINT "status_pages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_status_page_id_status_pages_id_fk" FOREIGN KEY ("status_page_id") REFERENCES "public"."status_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_results_monitor_id_idx" ON "check_results" USING btree ("monitor_id");--> statement-breakpoint
CREATE INDEX "check_results_time_idx" ON "check_results" USING btree ("time");--> statement-breakpoint
CREATE INDEX "incident_updates_incident_id_idx" ON "incident_updates" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incidents_status_page_id_idx" ON "incidents" USING btree ("status_page_id");--> statement-breakpoint
CREATE INDEX "incidents_user_id_idx" ON "incidents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "monitors_user_id_idx" ON "monitors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_channels_user_id_idx" ON "notification_channels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "spm_status_page_id_idx" ON "status_page_monitors" USING btree ("status_page_id");--> statement-breakpoint
CREATE INDEX "spm_monitor_id_idx" ON "status_page_monitors" USING btree ("monitor_id");--> statement-breakpoint
CREATE INDEX "status_pages_user_id_idx" ON "status_pages" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "status_pages_slug_idx" ON "status_pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "subscribers_status_page_id_idx" ON "subscribers" USING btree ("status_page_id");