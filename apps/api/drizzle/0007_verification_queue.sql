CREATE TABLE "verification_proofs" (
	"proof_hash" text PRIMARY KEY NOT NULL,
	"cid" text NOT NULL,
	"content" text NOT NULL,
	"bytes" integer NOT NULL,
	"token_address" text NOT NULL,
	"uploader" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_address" text NOT NULL,
	"submitter_address" text NOT NULL,
	"proof_hash" text NOT NULL,
	"ipfs_cid" text NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"suggested_tier" text,
	"tier" text,
	"reward_amount" numeric(78, 0),
	"theorems" jsonb,
	"error_summary" text,
	"compile_ms" integer,
	"started_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"tx_hash_submit" text,
	"tx_hash_result" text,
	"admin_tier_override" boolean DEFAULT false NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"last_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "formal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "formal_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_verification_token" ON "verification_submissions" USING btree ("token_address");--> statement-breakpoint
CREATE INDEX "idx_verification_submitter" ON "verification_submissions" USING btree ("submitter_address");--> statement-breakpoint
CREATE INDEX "idx_verification_status" ON "verification_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_verification_submitted" ON "verification_submissions" USING btree ("submitted_at");