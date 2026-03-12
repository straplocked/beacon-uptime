ALTER TABLE "status_page_monitors" ADD COLUMN "display_style" text DEFAULT 'bars' NOT NULL;--> statement-breakpoint
ALTER TABLE "status_pages" ADD COLUMN "footer_config" jsonb;