import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config } from 'dotenv';
import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../src/db/schema';
import { createPlacesService } from '../../src/server/places';
import { slugify } from '../../src/lib/catalog';
import { toMapPlace } from '../../src/lib/geo';

// Tylko SELECT: bez seeda, migracji ani zmian danych na Supabase.
test('Supabase: publiczne wyszukiwanie, szczegóły, karty, miasta i PostGIS', {
  skip: process.env.PLACES_INTEGRATION_TEST !== '1', timeout: 90_000,
}, async () => {
  config({ path: '.env.local', quiet: true });
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL_MISSING');
  const client = postgres(process.env.DATABASE_URL, {
    ssl: 'require', prepare: false, max: 1, connect_timeout: 15,
  });
  const database = drizzle(client, { schema });
  const service = createPlacesService(database);
  try {
    const [totals] = await database.select({ total: count() }).from(schema.places)
      .where(eq(schema.places.isPublished, true));
    const results = await service.searchPlaces({ limit: 2 });
    assert.equal(results.total, totals.total);
    assert.ok(results.items.length <= 2);
    const map = await service.searchMapPoints({ limit: 2 });
    assert.equal(map.total, results.total);
    assert.deepEqual(map.items, results.items.map(toMapPlace));
    const cities = await service.getCityOptions();
    assert.equal(cities[0].count, totals.total);
    assert.equal(await service.getPlaceBySlug('nonexistent-integration-test-slug'), null);
    const [draft] = await database.select().from(schema.places)
      .where(eq(schema.places.isPublished, false)).limit(1);
    if (draft) assert.equal(await service.getPlaceBySlug(draft.slug), null);

    if (results.items.length) {
      const first = results.items[0];
      const detail = await service.getPlaceBySlug(first.slug);
      assert.equal(detail?.id, first.id);
      assert.equal(detail?.cards.length, 4);
      assert.ok(detail?.createdAt && !Number.isNaN(Date.parse(detail.createdAt)));
      const filtered = await service.searchPlaces({ city: first.address.citySlug, category: first.category });
      assert.ok(filtered.items.every((item) => item.category === first.category
        && item.address.citySlug === first.address.citySlug));
      const byName = await service.searchPlaces({ q: slugify(first.name), limit: 100 });
      assert.ok(byName.items.some((item) => item.id === first.id));
      const next = await service.searchPlaces({ limit: 1, offset: 1 });
      if (results.items[1]) assert.equal(next.items[0].id, results.items[1].id);
      const { lat, lng } = first.location;
      const byBox = await service.searchPlaces({ bbox: [lng - 0.001, lat - 0.001, lng + 0.001, lat + 0.001], limit: 100 });
      assert.ok(byBox.items.some((item) => item.id === first.id));
      const mapByBox = await service.searchMapPoints({ bbox: [lng - 0.001, lat - 0.001, lng + 0.001, lat + 0.001], limit: 100 });
      assert.equal(mapByBox.total, byBox.total);
      assert.deepEqual(mapByBox.items, byBox.items.map(toMapPlace));
      const nearby = await service.searchPlaces({ lat, lng, radius: 100, limit: 100 });
      assert.ok(nearby.items.some((item) => item.id === first.id));
      console.log(JSON.stringify({ publishedPlaces: totals.total, cities: cities.length - 1, details: 'ok', postgis: 'ok' }));
    }

    const byCards = await service.searchPlaces({ cards: ['multisport', 'beactive'], limit: 100 });
    for (const item of byCards.items) {
      for (const provider of ['multisport', 'beactive']) {
        const claim = item.cards.find((card) => card.provider === provider);
        assert.ok(claim && ['accepted', 'conditional'].includes(claim.status));
        assert.ok(!claim.expiresAt || new Date(claim.expiresAt) > new Date());
      }
    }
    await assert.rejects(service.searchPlaces({ bbox: [22, 52, 20, 54] }), /INVALID_BBOX/);
    await assert.rejects(service.searchPlaces({ lat: 52 }), /INVALID_RADIUS/);
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    // Nie drukujemy błędu sterownika z parametrami połączenia/zapytania.
    const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : error;
    const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : 'DATABASE_READ_FAILED';
    throw new Error(`SUPABASE_READ_CHECK_${code}`);
  } finally {
    await client.end({ timeout: 5 });
  }
});
