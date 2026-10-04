CREATE TYPE "public"."contribution_review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "admin_users" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "card_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" "card_status" NOT NULL,
	"conditions" text,
	"source_url" text,
	"review_status" "contribution_review_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"review_note" text,
	"previous_claim" jsonb,
	CONSTRAINT "card_contributions_provider_check" CHECK ("card_contributions"."provider" in ('multisport', 'beactive', 'medicover-sport', 'pzu-sport')),
	CONSTRAINT "card_contributions_status_check" CHECK ("card_contributions"."status" <> 'unknown'),
	CONSTRAINT "card_contributions_review_check" CHECK (("card_contributions"."review_status" = 'pending' and "card_contributions"."reviewed_at" is null and "card_contributions"."reviewed_by" is null) or ("card_contributions"."review_status" <> 'pending' and "card_contributions"."reviewed_at" is not null and "card_contributions"."reviewed_by" is not null))
);
--> statement-breakpoint
ALTER TABLE "card_contributions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "card_contributions" ADD CONSTRAINT "card_contributions_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_contributions" ADD CONSTRAINT "card_contributions_reviewed_by_admin_users_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."admin_users"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_contributions_review_created_idx" ON "card_contributions" USING btree ("review_status","created_at");--> statement-breakpoint
CREATE INDEX "card_contributions_place_idx" ON "card_contributions" USING btree ("place_id");