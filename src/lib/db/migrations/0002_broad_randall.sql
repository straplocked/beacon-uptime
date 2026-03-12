ALTER TABLE "status_pages" ALTER COLUMN "brand_color" SET DEFAULT '#14b8a6';--> statement-breakpoint
ALTER TABLE "status_pages" ADD COLUMN "theme" text DEFAULT 'midnight' NOT NULL;