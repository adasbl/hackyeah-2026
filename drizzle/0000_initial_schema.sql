CREATE SCHEMA IF NOT EXISTS extensions;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;--> statement-breakpoint
-- Nie przenosimy istniejącego PostGIS, ponieważ może mieć zależności w bazie.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'postgis' AND n.nspname = 'extensions'
  ) THEN
    RAISE EXCEPTION 'PostGIS musi być zainstalowany w schemacie extensions. Sprawdź istniejący schemat rozszerzenia przed migracją.';
  END IF;
END
$$;--> statement-breakpoint
CREATE TYPE "public"."card_status" AS ENUM('accepted', 'conditional', 'not_accepted', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."osm_entity_type" AS ENUM('node', 'way', 'relation');--> statement-breakpoint
CREATE TYPE "public"."place_category" AS ENUM('silownia', 'basen', 'fitness', 'joga', 'wspinaczka', 'squash');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('venue', 'public_source', 'automated', 'community');--> statement-breakpoint
CREATE TABLE "card_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "card_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "place_card_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"status" "card_status" DEFAULT 'unknown' NOT NULL,
	"conditions" text,
	"source_type" "source_type" NOT NULL,
	"source_url" text,
	"source_quote" text,
	"confidence" "confidence_level" DEFAULT 'low' NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "place_card_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"osm_type" "osm_entity_type",
	"osm_id" bigint,
	"osm_version" integer,
	"osm_changeset_id" bigint,
	"osm_timestamp" timestamp with time zone,
	"osm_user_name" text,
	"osm_user_id" bigint,
	"osm_tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"brand_wikidata_id" text,
	"description" text,
	"category" "place_category" NOT NULL,
	"address_street" text,
	"address_house_number" text,
	"address_floor" text,
	"level" text,
	"postal_code" text,
	"city" text,
	"city_slug" text,
	"location" extensions.geometry(Point,4326) NOT NULL,
	"opening_hours_raw" text,
	"opening_hours" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"check_date" date,
	"opening_hours_check_date" date,
	"payment_methods" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"website" text,
	"phone" text,
	"amenities" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"prices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "places" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "place_card_claims" ADD CONSTRAINT "place_card_claims_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_card_claims" ADD CONSTRAINT "place_card_claims_provider_id_card_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."card_providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_providers_slug_uidx" ON "card_providers" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "place_card_claims_place_provider_uidx" ON "place_card_claims" USING btree ("place_id","provider_id");--> statement-breakpoint
CREATE INDEX "place_card_claims_place_idx" ON "place_card_claims" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "place_card_claims_provider_status_idx" ON "place_card_claims" USING btree ("provider_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "places_slug_uidx" ON "places" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "places_osm_entity_uidx" ON "places" USING btree ("osm_type","osm_id");--> statement-breakpoint
CREATE INDEX "places_city_slug_idx" ON "places" USING btree ("city_slug");--> statement-breakpoint
CREATE INDEX "places_category_idx" ON "places" USING btree ("category");--> statement-breakpoint
CREATE INDEX "places_location_gist_idx" ON "places" USING gist ("location");--> statement-breakpoint
CREATE INDEX "places_osm_tags_gin_idx" ON "places" USING gin ("osm_tags");
