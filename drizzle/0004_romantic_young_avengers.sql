ALTER TABLE "articles" ALTER COLUMN "status" SET DEFAULT 'queued';--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;