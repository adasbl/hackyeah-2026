import { inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import {
  DEMO_DATASET,
  DEMO_MARKER,
  SEED_PLACES,
  SEED_PROVIDERS,
} from "./seed-data";

type SeedExecutor = Pick<PostgresJsDatabase<typeof schema>, "insert" | "select">;

export interface SeedSummary {
  providers: number;
  places: number;
  publishedPlaces: number;
  draftPlaces: number;
  claims: number;
}

/** Wywołuj wewnątrz transakcji, aby błąd nie zostawił części danych. */
export async function seedDemoData(db: SeedExecutor): Promise<SeedSummary> {
  const { places, cardProviders, placeCardClaims } = schema;
  const existingPlaces = await db
    .select({ slug: places.slug, tags: places.osmTags })
    .from(places)
    .where(inArray(places.slug, SEED_PLACES.map(({ place }) => place.slug)));

  // Nie nadpisujemy obiektu spoza tego zestawu, nawet przy kolizji sluga.
  if (existingPlaces.some(({ tags }) => tags[DEMO_MARKER] !== DEMO_DATASET)) {
    throw new Error("SEED_SLUG_CONFLICT");
  }

  // Istniejące nazwy operatorów mogą zostać edytowane przez moderatora.
  await db.insert(cardProviders).values(SEED_PROVIDERS)
    .onConflictDoNothing({ target: cardProviders.slug });

  const providers = await db.select({ id: cardProviders.id, slug: cardProviders.slug })
    .from(cardProviders)
    .where(inArray(cardProviders.slug, SEED_PROVIDERS.map(({ slug }) => slug)));
  const providerIds = new Map(providers.map(({ slug, id }) => [slug, id]));

  for (const { place, claims } of SEED_PLACES) {
    const [saved] = await db.insert(places).values(place)
      .onConflictDoUpdate({
        target: places.slug,
        set: place,
        // Chroni również przed kolizją powstałą po wstępnym odczycie.
        setWhere: sql`${places.osmTags}->>${DEMO_MARKER} = ${DEMO_DATASET}`,
      })
      .returning({ id: places.id });

    if (!saved) throw new Error("SEED_SLUG_CONFLICT");

    for (const { providerSlug, ...claim } of claims) {
      const providerId = providerIds.get(providerSlug);
      if (!providerId) throw new Error("SEED_PROVIDER_MISSING");

      await db.insert(placeCardClaims).values({
        ...claim,
        placeId: saved.id,
        providerId,
      }).onConflictDoUpdate({
        target: [placeCardClaims.placeId, placeCardClaims.providerId],
        set: claim,
      });
    }
  }

  const publishedPlaces = SEED_PLACES.filter(({ place }) => place.isPublished).length;
  return {
    providers: providers.length,
    places: SEED_PLACES.length,
    publishedPlaces,
    draftPlaces: SEED_PLACES.length - publishedPlaces,
    claims: SEED_PLACES.reduce((count, { claims }) => count + claims.length, 0),
  };
}
