ALTER TABLE "articles" DROP CONSTRAINT "articles_user_url_lang_level";--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "source_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "source_type" text DEFAULT 'url' NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "pdf_url" text;