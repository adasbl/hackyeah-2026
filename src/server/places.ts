import { and, asc, count, eq, exists, getTableColumns, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { CARD_PROVIDER_SLUGS, type CardStatsResponse, type GeoPoint, type PlaceDetails, type PlaceSummary, type PlacesQuery, type PlacesResponse } from '@repo/types';
import * as schema from '@/db/schema';
import { ALL_CITIES_LABEL, ALL_CITIES_SLUG, slugify } from '@/lib/catalog';
import { distanceMeters, MAP_LIMIT, type MapPlacesResult } from '@/lib/geo';
import { isOpenNow } from '@/lib/opening-hours';
import { toPlaceDetails, type ClaimRow, type PlaceRow } from './place-mapper';

const { places, cardProviders, placeCardClaims } = schema;
type Database = Pick<PostgresJsDatabase<typeof schema>, 'select'>;
type Filterable = Omit<PlacesQuery, 'limit' | 'offset' | 'sort'>;

/**
 * Kolumny obiektu dla listy i szczegółów. Pomijamy surowe dane OSM (osm_tags, historia edycji,
 * oryginalne godziny), których frontend nie pokazuje – przy „otwarte teraz” czytamy wszystkie
 * pasujące wiersze, więc każdy zbędny bajt idzie razy liczba obiektów.
 */
const placeColumns = (() => {
  const {
    id, slug, name, category, description, addressStreet, addressHouseNumber, postalCode,
    city, citySlug, location, openingHours, website, phone, amenities, prices, createdAt, updatedAt,
  } = getTableColumns(places);
  return {
    id, slug, name, category, description, addressStreet, addressHouseNumber, postalCode,
    city, citySlug, location, openingHours, website, phone, amenities, prices, createdAt, updatedAt,
  } satisfies Record<keyof PlaceRow, unknown>;
})();

const emptyCardStats = (): CardStatsResponse => ({
  total: 0,
  providers: CARD_PROVIDER_SLUGS.map((provider) => ({ provider, accepted: 0, conditional: 0, notAccepted: 0, unknown: 0 })),
});

export interface CityOption {
  slug: string;
  name: string;
  count: number;
}

function toSummary(place: PlaceDetails, point?: GeoPoint): PlaceSummary {
  const { id, slug, name, category, address, location, cards, priceFrom, openingHours, updatedAt } = place;
  return {
    id, slug, name, category, address, location, cards, priceFrom, openingHours, updatedAt,
    ...(point ? { distanceMeters: Math.round(distanceMeters(point, location)) } : {}),
  };
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  return value === undefined || !Number.isFinite(value)
    ? fallback : Math.min(max, Math.max(min, Math.trunc(value)));
}

export function createPlacesService(database: Database) {
  async function loadDetails(rows: PlaceRow[]): Promise<PlaceDetails[]> {
    if (!rows.length) return [];
    const claims = await database.select({
      ...getTableColumns(placeCardClaims), providerSlug: cardProviders.slug,
    }).from(placeCardClaims)
      .innerJoin(cardProviders, eq(cardProviders.id, placeCardClaims.providerId))
      .where(inArray(placeCardClaims.placeId, rows.map((row) => row.id)));
    const byPlace = new Map<string, ClaimRow[]>();
    for (const claim of claims) {
      const group = byPlace.get(claim.placeId) ?? [];
      group.push(claim);
      byPlace.set(claim.placeId, group);
    }
    return rows.map((row) => toPlaceDetails(row, byPlace.get(row.id) ?? []));
  }

  function buildWhere(query: Filterable) {
    const filters: SQL[] = [eq(places.isPublished, true)];
    if (query.city && query.city !== ALL_CITIES_SLUG) filters.push(eq(places.citySlug, query.city));
    if (query.category) filters.push(eq(places.category, query.category));

    const phrase = query.q?.trim() ?? '';
    const search = slugify(phrase);
    if (search) {
      // Taka sama normalizacja polskich znaków i separatorów jak w formularzu.
      const searchable = sql`regexp_replace(translate(lower(concat_ws(' ',
        ${places.name}, ${places.brand}, ${places.addressStreet}, ${places.addressHouseNumber}, ${places.postalCode}, ${places.city})),
        'ąćęłńóśźż', 'acelnoszz'), '[^a-z0-9]+', '-', 'g')`;
      const textMatch = sql`${searchable} like ${`%${search}%`}`;
      // Kod z myślnikiem, spacją lub bez separatora wskazuje ten sam obszar.
      const postcode = /^\d{2}(?:-|\s)?\d{3}$/.test(phrase)
        ? phrase.replace(/\D/g, '') : undefined;
      filters.push(postcode
        ? or(textMatch, sql`regexp_replace(${places.postalCode}, '[^0-9]', '', 'g') = ${postcode}`)!
        : textMatch);
    }

    const providers = [...new Set(query.cards ?? [])];
    if (providers.length) {
      filters.push(exists(database.select({ id: placeCardClaims.id })
        .from(placeCardClaims)
        .innerJoin(cardProviders, eq(cardProviders.id, placeCardClaims.providerId))
        .where(and(
          eq(placeCardClaims.placeId, places.id),
          inArray(cardProviders.slug, providers),
          inArray(placeCardClaims.status, ['accepted', 'conditional']),
          or(isNull(placeCardClaims.expiresAt), sql`${placeCardClaims.expiresAt} > now()`),
        ))));
    }

    if (query.bbox) {
      const [west, south, east, north] = query.bbox;
      if (![west, south, east, north].every(Number.isFinite)
        || west < -180 || east > 180 || south < -90 || north > 90
        || west > east || south > north) throw new Error('INVALID_BBOX');
      filters.push(sql`extensions.st_intersects(${places.location},
        extensions.st_makeenvelope(${west}, ${south}, ${east}, ${north}, 4326))`);
    }
    if (query.lat !== undefined || query.lng !== undefined || query.radius !== undefined) {
      const { lat, lng, radius } = query;
      if (lat === undefined || lng === undefined || ![lat, lng].every(Number.isFinite)
        || Math.abs(lat) > 90 || Math.abs(lng) > 180
        || (radius !== undefined && (!Number.isFinite(radius) || radius < 0))) throw new Error('INVALID_RADIUS');
      if (radius !== undefined) {
        filters.push(sql`extensions.st_dwithin(${places.location}::extensions.geography,
          extensions.st_setsrid(extensions.st_makepoint(${lng}, ${lat}), 4326)::extensions.geography,
          ${radius})`);
      }
    }

    return and(...filters);
  }

  async function search(query: PlacesQuery, maxLimit: number, defaultLimit: number): Promise<PlacesResponse> {
    const limit = boundedInteger(query.limit, defaultLimit, 1, maxLimit);
    const offset = boundedInteger(query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const where = buildWhere(query);
    const point = query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : undefined;
    const order = query.sort === 'distance' && point
      ? [sql`extensions.st_distance(${places.location}::extensions.geography,
          extensions.st_setsrid(extensions.st_makepoint(${point.lng}, ${point.lat}), 4326)::extensions.geography)`, asc(places.name), asc(places.id)]
      : [asc(places.name), asc(places.id)];
    const selection = database.select(placeColumns).from(places).where(where).orderBy(...order);
    let rows: PlaceRow[];
    let total: number;
    if (query.openNow) {
      // Godziny mają format aplikacji; filtrujemy przed paginacją i liczeniem wyników.
      const now = new Date();
      const opened = (await selection).filter((row) => isOpenNow(row.openingHours, now));
      total = opened.length;
      rows = opened.slice(offset, offset + limit);
    } else {
      const [page, totals] = await Promise.all([
        selection.limit(limit).offset(offset),
        database.select({ total: count() }).from(places).where(where),
      ]);
      rows = page;
      total = totals[0].total;
    }
    return { items: (await loadDetails(rows)).map((place) => toSummary(place, point)), total, limit, offset };
  }

  async function searchPlaces(query: PlacesQuery): Promise<PlacesResponse> {
    return search(query, 100, 20);
  }

  async function searchMapPoints(query: Filterable & { limit?: number }): Promise<MapPlacesResult> {
    const limit = boundedInteger(query.limit, MAP_LIMIT, 1, MAP_LIMIT);
    const where = buildWhere(query);
    // Pinezki nie potrzebują szczegółów obiektu ani potwierdzeń kart.
    // Filtry kart nadal działają przez EXISTS w buildWhere.
    const selection = database.select({
      id: places.id, slug: places.slug, name: places.name, category: places.category,
      addressStreet: places.addressStreet, addressHouseNumber: places.addressHouseNumber,
      city: places.city, location: places.location,
      ...(query.openNow ? { openingHours: places.openingHours } : {}),
    }).from(places).where(where).orderBy(asc(places.name), asc(places.id));
    let rows: Awaited<typeof selection>;
    let total: number;
    if (query.openNow) {
      // Godziny sprawdzamy przed limitem, aby licznik obejmował wszystkie otwarte obiekty.
      const now = new Date();
      const opened = (await selection).filter((row) => isOpenNow(row.openingHours ?? [], now));
      total = opened.length;
      rows = opened.slice(0, limit);
    } else {
      const [points, totals] = await Promise.all([
        selection.limit(limit),
        database.select({ total: count() }).from(places).where(where),
      ]);
      rows = points;
      total = totals[0].total;
    }
    return {
      items: rows.map((row) => ({
        id: row.id, slug: row.slug, name: row.name, category: row.category,
        street: [row.addressStreet, row.addressHouseNumber].filter(Boolean).join(' '),
        city: row.city ?? '',
        location: { lat: row.location.y, lng: row.location.x },
      })),
      total,
    };
  }

  async function getPlacesBySlugs(slugs: string[]): Promise<PlaceSummary[]> {
    if (!slugs.length) return [];
    const rows = await database.select(placeColumns).from(places)
      .where(and(eq(places.isPublished, true), inArray(places.slug, [...new Set(slugs)])));
    const bySlug = new Map((await loadDetails(rows)).map((place) => [place.slug, toSummary(place)]));
    return slugs.flatMap((slug) => {
      const place = bySlug.get(slug);
      return place ? [place] : [];
    });
  }

  async function getCardStats(query: Omit<Filterable, 'cards'>): Promise<CardStatsResponse> {
    const now = new Date();
    const rows = await database.select(placeColumns).from(places).where(buildWhere({ ...query, cards: [] }));
    const matching = query.openNow ? rows.filter((row) => isOpenNow(row.openingHours, now)) : rows;
    const details = await loadDetails(matching);
    const providers = CARD_PROVIDER_SLUGS.map((provider) => {
      const counts = { provider, accepted: 0, conditional: 0, notAccepted: 0, unknown: 0 };
      for (const place of details) {
        const claim = place.cards.find((card) => card.provider === provider);
        const status = claim && (!claim.expiresAt || new Date(claim.expiresAt) > now) ? claim.status : 'unknown';
        if (status === 'accepted') counts.accepted++;
        else if (status === 'conditional') counts.conditional++;
        else if (status === 'not_accepted') counts.notAccepted++;
        else counts.unknown++;
      }
      return counts;
    });
    return { total: details.length, providers };
  }

  /**
   * Statystyki kart dla wszystkich miast naraz („polska” = suma): dwa zapytania agregujące w bazie
   * zamiast pobierania wszystkich obiektów i ich kart osobno dla każdego miasta.
   * Semantyka jak w getCardStats: brak potwierdzenia lub wygasłe potwierdzenie = unknown.
   */
  async function getCardStatsByCity(): Promise<Record<string, CardStatsResponse>> {
    const published = eq(places.isPublished, true);
    const [totals, claims] = await Promise.all([
      database.select({ city: places.citySlug, total: count() })
        .from(places).where(published).groupBy(places.citySlug),
      database.select({ city: places.citySlug, provider: cardProviders.slug, status: placeCardClaims.status, total: count() })
        .from(placeCardClaims)
        .innerJoin(places, eq(places.id, placeCardClaims.placeId))
        .innerJoin(cardProviders, eq(cardProviders.id, placeCardClaims.providerId))
        .where(and(
          published,
          inArray(placeCardClaims.status, ['accepted', 'conditional', 'not_accepted']),
          or(isNull(placeCardClaims.expiresAt), sql`${placeCardClaims.expiresAt} > now()`),
        ))
        .groupBy(places.citySlug, cardProviders.slug, placeCardClaims.status),
    ]);

    const result: Record<string, CardStatsResponse> = {};
    const statsFor = (city: string) => (result[city] ??= emptyCardStats());
    const areasOf = (city: string | null) => (city ? [ALL_CITIES_SLUG, city] : [ALL_CITIES_SLUG]);
    for (const row of totals) {
      for (const area of areasOf(row.city)) statsFor(area).total += row.total;
    }
    for (const row of claims) {
      for (const area of areasOf(row.city)) {
        const counts = statsFor(area).providers.find((p) => p.provider === row.provider);
        if (!counts) continue; // operator spoza listy kart obsługiwanych przez aplikację
        if (row.status === 'accepted') counts.accepted += row.total;
        else if (row.status === 'conditional') counts.conditional += row.total;
        else counts.notAccepted += row.total;
      }
    }
    for (const stats of Object.values(result)) {
      for (const p of stats.providers) p.unknown = stats.total - p.accepted - p.conditional - p.notAccepted;
    }
    result[ALL_CITIES_SLUG] ??= emptyCardStats();
    return result;
  }

  async function getPlaceBySlug(slug: string): Promise<PlaceDetails | null> {
    const rows = await database.select(placeColumns).from(places)
      .where(and(eq(places.slug, slug), eq(places.isPublished, true))).limit(1);
    return (await loadDetails(rows))[0] ?? null;
  }

  async function getCityOptions(): Promise<CityOption[]> {
    const [cities, totals] = await Promise.all([
      database.select({ slug: places.citySlug, name: sql<string>`min(${places.city})`, count: count() })
        .from(places).where(and(eq(places.isPublished, true), sql`${places.citySlug} <> ''`, sql`${places.city} <> ''`))
        .groupBy(places.citySlug).orderBy(sql`min(${places.city})`),
      database.select({ total: count() }).from(places).where(eq(places.isPublished, true)),
    ]);
    return [
      { slug: ALL_CITIES_SLUG, name: ALL_CITIES_LABEL, count: totals[0].total },
      ...cities.map((city) => ({ ...city, slug: city.slug! })),
    ];
  }

  return { searchPlaces, searchMapPoints, getPlaceBySlug, getPlacesBySlugs, getCardStats, getCardStatsByCity, getCityOptions };
}
