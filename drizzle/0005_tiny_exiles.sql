CREATE TABLE "allowlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry" text NOT NULL,
	"type" text NOT NULL,
	"notes" text,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allowlist_entry_unique" UNIQUE("entry")
);
--> statement-breakpoint
CREATE INDEX "idx_allowlist_entry" ON "allowlist" USING btree ("entry");--> statement-breakpoint
CREATE INDEX "idx_allowlist_type" ON "allowlist" USING btree ("type");