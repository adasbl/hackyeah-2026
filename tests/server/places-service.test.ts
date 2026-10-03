import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../src/db/schema';
import { createPlacesService } from '../../src/server/places';
import type { ClaimRow } from '../../src/server/place-mapper';

type PlaceRow = typeof schema.places.$inferSelect;
const date = new Date('2026-10-03T10:00:00Z');
const allDay = [{ days: 'pon–niedz', hours: '0:00–24:00' }];

function place(slug: string, openingHours = allDay): PlaceRow {
  return {
    id: slug, slug, name: slug, category: 'basen', description: null, brand: null, brandWikidataId: null,
    osmType: null, osmId: null, osmVersion: null, osmChangesetId: null, osmTimestamp: null,
    osmUserName: null, osmUserId: null, osmTags: {}, addressStreet: null, addressHouseNumber: null,
    addressFloor: null, level: null, postalCode: null, city: 'Łódź', citySlug: 'lodz',
    location: { x: 19.45, y: 51.77 }, openingHoursRaw: null, openingHours,
    checkDate: null, openingHoursCheckDate: null, paymentMethods: [], website: null, phone: null,
    amenities: [], isPublished: true, prices: [], createdAt: date, updatedAt: date,
  };
}

// Drizzle buduje rzeczywisty SQL. Podmieniamy tylko wykonanie, bez połączenia z bazą.
function harness(rows: PlaceRow[], claims: ClaimRow[] = []) {
  const database = drizzle.mock({ schema });
  const queries: { sql: string; params: unknown[] }[] = [];
  const select = database.select.bind(database) as typeof database.select;
  database.select = ((fields?: Parameters<typeof select>[0]) => {
    const builder = fields ? select(fields) : select();
    const from = builder.from.bind(builder);
    builder.from = ((table: Parameters<typeof from>[0]) => {
      const query = from(table);
      query.execute = (async () => {
        const compiled = query.toSQL();
        queries.push(compiled);
        if (table === schema.placeCardClaims) return claims.filter((claim) => compiled.params.includes(claim.placeId));
        if (fields && 'total' in fields) return [{ total: rows.length }];
        const value = (keyword: string, fallback: number) => {
          const match = new RegExp(keyword + ' \\$(\\d+)').exec(compiled.sql);
          return match ? Number(compiled.params[Number(match[1]) - 1]) : fallback;
        };
        const offset = value('offset', 0);
        return rows.slice(offset, offset + value('limit', rows.length));
      }) as typeof query.execute;
      return query;
    }) as typeof builder.from;
    return builder;
  }) as typeof database.select;
  return { service: createPlacesService(database), queries };
}

test('mapa pobiera ponad 100 obiektów, lista zachowuje limit publicznego API', async () => {
  const { service } = harness(Array.from({ length: 105 }, (_, i) => place(`place-${i}`)));
  const list = await service.searchPlaces({ limit: 2000 });
  const map = await service.searchMapPoints({});
  assert.equal(list.items.length, 100);
  assert.equal(list.total, 105);
  assert.equal(map.items.length, 105);
  assert.equal(map.total, 105);
  assert.deepEqual(map.items[0].openingHours, allDay);
});

test('otwarte teraz filtruje przed paginacją i liczeniem wyników', async () => {
  const { service } = harness([place('closed', []), place('first'), place('closed-2', []), place('second'), place('third')]);
  const result = await service.searchPlaces({ openNow: true, limit: 1, offset: 1 });
  assert.equal(result.total, 3);
  assert.deepEqual(result.items.map(({ slug }) => slug), ['second']);
  const map = await service.searchMapPoints({ openNow: true });
  assert.equal(map.total, 3);
});

test('odległość działa bez promienia, z promieniem używa filtra PostGIS', async () => {
  const { service, queries } = harness([place('at-origin')]);
  const result = await service.searchPlaces({ lat: 51.77, lng: 19.45, sort: 'distance' });
  assert.equal(result.items[0].distanceMeters, 0);
  assert.match(queries[0].sql, /order by extensions\.st_distance/);
  assert.doesNotMatch(queries[0].sql, /st_dwithin/);
  await service.searchPlaces({ lat: 51.77, lng: 19.45, radius: 5000 });
  assert.ok(queries.some(({ sql }) => sql.includes('extensions.st_dwithin')));
  await assert.rejects(service.searchPlaces({ lat: 52 }), /INVALID_RADIUS/);
});

test('ulubione zachowują kolejność i pomijają nieistniejące slugi; SQL wymaga publikacji', async () => {
  const { service, queries } = harness([place('first'), place('second')]);
  const result = await service.getPlacesBySlugs(['second', 'missing', 'first']);
  assert.deepEqual(result.map(({ slug }) => slug), ['second', 'first']);
  assert.match(queries[0].sql, /"is_published" = \$\d+/);
  assert.ok(queries[0].params.includes(true));
  assert.match(queries[0].sql, /"slug" in/);
  assert.ok(queries[0].params.includes('missing'));
});

test('statystyki kart traktują brak i wygasłe potwierdzenia jako unknown', async () => {
  const claim: ClaimRow = {
    id: 'claim', placeId: 'first', providerId: 'provider', providerSlug: 'multisport',
    status: 'accepted', conditions: null, sourceType: 'venue', sourceUrl: null, sourceQuote: null,
    confidence: 'high', verifiedAt: date, expiresAt: new Date('2000-01-01'), createdAt: date, updatedAt: date,
  };
  const valid = { ...claim, id: 'valid', placeId: 'second', expiresAt: null };
  const { service, queries } = harness([place('first'), place('second')], [claim, valid]);
  const result = await service.getCardStats({ city: 'lodz' });
  assert.equal(result.total, 2);
  assert.deepEqual(result.providers[0], { provider: 'multisport', accepted: 1, conditional: 0, notAccepted: 0, unknown: 1 });
  assert.ok(result.providers.slice(1).every((provider) => provider.unknown === 2));
  assert.match(queries[0].sql, /"is_published" = \$\d+/);
  assert.ok(queries[0].params.includes('lodz'));
});
