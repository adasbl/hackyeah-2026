import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../src/db/schema";
import { DEMO_MARKER, SEED_PLACES, SEED_PROVIDERS } from "../../src/db/seed-data";
import { seedDemoData } from "../../src/db/seed-demo";

// Test sieciowy tylko na jawne żądanie. Zawsze wycofuje wszystkie zapisy.
test("Supabase: seed jest powtarzalny, obsługuje NULL i chroni obce rekordy", {
  skip: process.env.SEED_INTEGRATION_TEST !== "1",
  timeout: 120_000,
}, async () => {
  config({ path: ".env.local", quiet: true });
  assert.ok(process.env.DATABASE_MIGRATION_URL, "DATABASE_MIGRATION_URL_MISSING");
  const client = postgres(process.env.DATABASE_MIGRATION_URL, {
    ssl: "require", max: 1, prepare: false, connect_timeout: 15,
  });
  const db = drizzle(client, { schema });
  const { places, cardProviders, placeCardClaims } = schema;
  const placeSlugs = SEED_PLACES.map(({ place }) => place.slug);
  const providerSlugs = SEED_PROVIDERS.map(({ slug }) => slug);
  const rollback = new Error("EXPECTED_TEST_ROLLBACK");
  try {
    const beforePlaces = await db.select().from(places)
      .where(inArray(places.slug, placeSlugs)).orderBy(places.slug);
    const beforeProviders = await db.select().from(cardProviders)
      .where(inArray(cardProviders.slug, providerSlugs)).orderBy(cardProviders.slug);
    const beforeClaims = beforePlaces.length ? await db.select().from(placeCardClaims)
      .where(inArray(placeCardClaims.placeId, beforePlaces.map(({ id }) => id)))
      .orderBy(placeCardClaims.id) : [];
    try {
      await db.transaction(async (tx) => {
        const first = await seedDemoData(tx);
        assert.deepEqual(first, {
          providers: 4, places: 20, publishedPlaces: 15, draftPlaces: 5, claims: 60,
        });
        const readPlaces = () => tx.select().from(places)
          .where(inArray(places.slug, placeSlugs)).orderBy(places.slug);
        const initialPlaces = await readPlaces();
        assert.equal(initialPlaces.length, 20);
        const ids = initialPlaces.map(({ id }) => id);
        const readClaims = () => tx.select().from(placeCardClaims)
          .where(inArray(placeCardClaims.placeId, ids)).orderBy(placeCardClaims.id);
        const initialClaims = await readClaims();
        assert.equal(initialClaims.length, 60);
        assert.deepEqual(await seedDemoData(tx), first);
        const repeatedPlaces = await readPlaces();
        const repeatedClaims = await readClaims();
        const identity = ({ id, createdAt }: { id: string; createdAt: Date }) => ({ id, createdAt });
        assert.deepEqual(repeatedPlaces.map(identity), initialPlaces.map(identity));
        assert.deepEqual(repeatedClaims.map(identity), initialClaims.map(identity));
        for (const { place: fixture } of SEED_PLACES) {
          const saved = repeatedPlaces.find(({ slug }) => slug === fixture.slug)!;
          assert.deepEqual(saved.location, fixture.location);
          assert.equal(saved.city, fixture.city);
          assert.deepEqual(saved.prices, fixture.prices);
        }
        // Kolizja sluga obiektu bez znacznika naszego seeda nie może go nadpisać.
        const target = repeatedPlaces[0];
        await tx.update(places).set({ osmTags: { [DEMO_MARKER]: "other-dataset" } })
          .where(eq(places.id, target.id));
        await assert.rejects(() => seedDemoData(tx), /SEED_SLUG_CONFLICT/);
        throw rollback;
      });
      assert.fail("Test powinien zakończyć transakcję wycofaniem");
    } catch (error) {
      if (error !== rollback) throw error;
    }
    assert.deepEqual(await db.select().from(places)
      .where(inArray(places.slug, placeSlugs)).orderBy(places.slug), beforePlaces);
    assert.deepEqual(await db.select().from(cardProviders)
      .where(inArray(cardProviders.slug, providerSlugs)).orderBy(cardProviders.slug), beforeProviders);
    const afterClaims = beforePlaces.length ? await db.select().from(placeCardClaims)
      .where(inArray(placeCardClaims.placeId, beforePlaces.map(({ id }) => id)))
      .orderBy(placeCardClaims.id) : [];
    assert.deepEqual(afterClaims, beforeClaims);
  } finally {
    await client.end({ timeout: 5 });
  }
});
