CREATE TABLE "word_contexts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"saved_word_id" uuid NOT NULL,
	"context_sentence" text NOT NULL,
	"encountered_form" text NOT NULL,
	"source_article_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_words" ADD COLUMN "lemma" text;--> statement-breakpoint
ALTER TABLE "saved_words" ADD COLUMN "original_form" text;--> statement-breakpoint
ALTER TABLE "saved_words" ADD COLUMN "form_type" text;--> statement-breakpoint
ALTER TABLE "saved_words" ADD COLUMN "forms_seen" text;--> statement-breakpoint
ALTER TABLE "saved_words" ADD COLUMN "encounter_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "word_contexts" ADD CONSTRAINT "word_contexts_saved_word_id_saved_words_id_fk" FOREIGN KEY ("saved_word_id") REFERENCES "public"."saved_words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_contexts" ADD CONSTRAINT "word_contexts_source_article_id_articles_id_fk" FOREIGN KEY ("source_article_id") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_word_contexts_saved_word" ON "word_contexts" USING btree ("saved_word_id");--> statement-breakpoint
CREATE INDEX "idx_saved_words_lemma" ON "saved_words" USING btree ("lemma");