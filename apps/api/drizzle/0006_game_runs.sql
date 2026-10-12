CREATE TABLE "game_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet" text NOT NULL,
	"game" text NOT NULL,
	"level" text NOT NULL,
	"seed" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"time_ms" integer,
	"holder" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX "game_runs_board_idx" ON "game_runs" USING btree ("game","level","finished_at");--> statement-breakpoint
CREATE INDEX "game_runs_wallet_idx" ON "game_runs" USING btree ("wallet","started_at");