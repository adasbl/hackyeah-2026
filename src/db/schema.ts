import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  CARD_STATUSES,
  CATEGORY_SLUGS,
  SOURCE_TYPES,
  type CardProviderSlug,
  type OpeningHoursEntry,
  type Price,
} from "@repo/types";

import { wgs84Point } from "./geo-point";

const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
const OSM_ENTITY_TYPES = ["node", "way", "relation"] as const;

export const placeCategoryEnum = pgEnum("place_category", CATEGORY_SLUGS);
export const cardStatusEnum = pgEnum("card_status", CARD_STATUSES);
export const sourceTypeEnum = pgEnum("source_type", SOURCE_TYPES);
export const confidenceEnum = pgEnum("confidence_level", CONFIDENCE_LEVELS);
export const osmEntityTypeEnum = pgEnum("osm_entity_type", OSM_ENTITY_TYPES);
export const contributionReviewEnum = pgEnum("contribution_review_status", ["pending", "approved", "rejected"]);

// Identyfikatory kont zweryfikowanych przez Supabase Auth. Brak publicznych polityk RLS.
export const adminUsers = pgTable("admin_users", {
  userId: uuid("user_id").primaryKey(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}).enableRLS();

/**
 * Kanoniczny rekord obiektu używany przez wyszukiwarkę.
 *
 * Pola osm_* pozwalają ponawiać import bez tworzenia duplikatów oraz zachować
 * pochodzenie danych. Brakujące dane adresowe mogą zostać uzupełnione podczas
 * normalizacji lub geokodowania przed ustawieniem is_published = true.
 */
export const places = pgTable(
  "places",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    osmType: osmEntityTypeEnum("osm_type"),
    osmId: bigint("osm_id", { mode: "number" }),
    osmVersion: integer("osm_version"),
    osmChangesetId: bigint("osm_changeset_id", { mode: "number" }),
    osmTimestamp: timestamp("osm_timestamp", { withTimezone: true }),
    osmUserName: text("osm_user_name"),
    osmUserId: bigint("osm_user_id", { mode: "number" }),
    osmTags: jsonb("osm_tags")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    slug: text("slug").notNull(),
    name: text("name").notNull(),
    brand: text("brand"),
    brandWikidataId: text("brand_wikidata_id"),
    description: text("description"),
    category: placeCategoryEnum("category").notNull(),

    addressStreet: text("address_street"),
    addressHouseNumber: text("address_house_number"),
    addressFloor: text("address_floor"),
    level: text("level"),
    postalCode: text("postal_code"),
    city: text("city"),
    citySlug: text("city_slug"),

    /** PostGIS: x = longitude, y = latitude, WGS84 (EPSG:4326). */
    location: wgs84Point("location").notNull(),

    /** Oryginalny zapis OSM, np. Mo-Fr 06:00-23:00; Sa-Su 07:00-22:00. */
    openingHoursRaw: text("opening_hours_raw"),
    openingHours: jsonb("opening_hours")
      .$type<OpeningHoursEntry[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    checkDate: date("check_date", { mode: "string" }),
    openingHoursCheckDate: date("opening_hours_check_date", {
      mode: "string",
    }),

    /** Nazwy z tagów payment:*=yes, np. credit_cards, mastercard, visa. */
    paymentMethods: text("payment_methods")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),

    website: text("website"),
    phone: text("phone"),
    amenities: text("amenities")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    prices: jsonb("prices")
      .$type<Price[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    /** API publiczne powinno zwracać tylko rekordy gotowe po normalizacji. */
    isPublished: boolean("is_published").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("places_slug_uidx").on(table.slug),
    uniqueIndex("places_osm_entity_uidx").on(table.osmType, table.osmId),
    index("places_city_slug_idx").on(table.citySlug),
    index("places_category_idx").on(table.category),
    index("places_location_gist_idx").using("gist", table.location),
    index("places_osm_tags_gin_idx").using("gin", table.osmTags),
  ],
).enableRLS();

export const cardProviders = pgTable(
  "card_providers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("card_providers_slug_uidx").on(table.slug),
  ],
).enableRLS();

export const placeCardClaims = pgTable(
  "place_card_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => cardProviders.id, { onDelete: "restrict" }),
    status: cardStatusEnum("status").notNull().default("unknown"),
    conditions: text("conditions"),
    sourceType: sourceTypeEnum("source_type").notNull(),
    sourceUrl: text("source_url"),
    sourceQuote: text("source_quote"),
    confidence: confidenceEnum("confidence").notNull().default("low"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("place_card_claims_place_provider_uidx").on(
      table.placeId,
      table.providerId,
    ),
    index("place_card_claims_place_idx").on(table.placeId),
    index("place_card_claims_provider_status_idx").on(
      table.providerId,
      table.status,
    ),
  ],
).enableRLS();

export const cardContributions = pgTable("card_contributions", {
  id: uuid("id").defaultRandom().primaryKey(),
  placeId: uuid("place_id").notNull().references(() => places.id, { onDelete: "restrict" }),
  provider: text("provider").$type<CardProviderSlug>().notNull(),
  status: cardStatusEnum("status").notNull(),
  conditions: text("conditions"),
  sourceUrl: text("source_url"),
  reviewStatus: contributionReviewEnum("review_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: uuid("reviewed_by").references(() => adminUsers.userId, { onDelete: "restrict" }),
  reviewNote: text("review_note"),
  previousClaim: jsonb("previous_claim").$type<{
    status: typeof CARD_STATUSES[number]; conditions: string | null; sourceUrl: string | null;
  }>(),
}, (table) => [
  index("card_contributions_review_created_idx").on(table.reviewStatus, table.createdAt),
  index("card_contributions_place_idx").on(table.placeId),
  check("card_contributions_provider_check", sql`${table.provider} in ('multisport', 'beactive', 'medicover-sport', 'pzu-sport')`),
  check("card_contributions_status_check", sql`${table.status} <> 'unknown'`),
  check("card_contributions_review_check", sql`(${table.reviewStatus} = 'pending' and ${table.reviewedAt} is null and ${table.reviewedBy} is null) or (${table.reviewStatus} <> 'pending' and ${table.reviewedAt} is not null and ${table.reviewedBy} is not null)`),
]).enableRLS();

export const placesRelations = relations(places, ({ many }) => ({
  cardClaims: many(placeCardClaims),
}));

export const cardProvidersRelations = relations(
  cardProviders,
  ({ many }) => ({
    placeClaims: many(placeCardClaims),
  }),
);

export const placeCardClaimsRelations = relations(
  placeCardClaims,
  ({ one }) => ({
    place: one(places, {
      fields: [placeCardClaims.placeId],
      references: [places.id],
    }),
    provider: one(cardProviders, {
      fields: [placeCardClaims.providerId],
      references: [cardProviders.id],
    }),
  }),
);
