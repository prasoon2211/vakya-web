CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_url" text NOT NULL,
	"title" text,
	"original_content" text,
	"translated_content" text,
	"target_language" text NOT NULL,
	"cefr_level" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"translation_progress" integer DEFAULT 0 NOT NULL,
	"total_paragraphs" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"audio_url" text,
	"audio_duration_seconds" integer,
	"word_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_user_url_lang_level" UNIQUE("user_id","source_url","target_language","cefr_level")
);
--> statement-breakpoint
CREATE TABLE "saved_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"word" text NOT NULL,
	"context_sentence" text,
	"translation" text,
	"part_of_speech" text,
	"article" text,
	"example" text,
	"notes" text,
	"source_article_id" uuid,
	"mastery_level" integer DEFAULT 0 NOT NULL,
	"next_review_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"target_language" text NOT NULL,
	CONSTRAINT "saved_words_user_word_lang" UNIQUE("user_id","word","target_language")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text,
	"native_language" text DEFAULT 'English' NOT NULL,
	"target_language" text DEFAULT 'German' NOT NULL,
	"cefr_level" text DEFAULT 'B1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id")
);
--> statement-breakpoint
CREATE TABLE "word_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word" text NOT NULL,
	"target_language" text NOT NULL,
	"cefr_level" text NOT NULL,
	"translation" text,
	"part_of_speech" text,
	"article" text,
	"example" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "word_cache_unique" UNIQUE("word","target_language","cefr_level")
);
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_words" ADD CONSTRAINT "saved_words_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_words" ADD CONSTRAINT "saved_words_source_article_id_articles_id_fk" FOREIGN KEY ("source_article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_articles_user_id" ON "articles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_articles_created_at" ON "articles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_saved_words_user_id" ON "saved_words" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_saved_words_next_review" ON "saved_words" USING btree ("next_review_at");--> statement-breakpoint
CREATE INDEX "idx_word_cache_lookup" ON "word_cache" USING btree ("word","target_language");