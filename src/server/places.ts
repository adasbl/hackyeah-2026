import { and, asc, count, eq, exists, getTableColumns, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { CARD_PROVIDER_SLUGS, type CardStatsResponse, type GeoPoint, type PlaceDetails, type PlaceSummary, type PlacesQuery, type PlacesResponse } from '@repo/types';
import * as schema from '@/db/schema';
import { ALL_CITIES_LABEL, ALL_CITIES_SLUG, slugify } from '@/lib/catalog';
import { distanceMeters, MAP_LIMIT } from '@/lib/geo';
import { isOpenNow } from '@/lib/opening-hours';
import { toPlaceDetails, type ClaimRow } from './place-mapper';

const { places, cardProviders, placeCardClaims } = schema;
type Database = Pick<PostgresJsDatabase<typeof schema>, 'select'>;
type Filterable = Omit<PlacesQuery, 'limit' | 'offset' | 'sort'>;

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
  async function loadDetails(rows: (typeof places.$inferSelect)[]): Promise<PlaceDetails[]> {
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

    const search = slugify(query.q ?? '');
    if (search) {
      // Taka sama normalizacja polskich znaków i separatorów jak w formularzu.
      const searchable = sql`regexp_replace(translate(lower(concat_ws(' ',
        ${places.name}, ${places.addressStreet}, ${places.addressHouseNumber}, ${places.city})),
        'ąćęłńóśźż', 'acelnoszz'), '[^a-z0-9]+', '-', 'g')`;
      filters.push(sql`${searchable} like ${`%${search}%`}`);
    }

    for (const provider of new Set(query.cards ?? [])) {
      filters.push(exists(database.select({ id: placeCardClaims.id })
        .from(placeCardClaims)
        .innerJoin(cardProviders, eq(cardProviders.id, placeCardClaims.providerId))
        .where(and(
          eq(placeCardClaims.placeId, places.id),
          eq(cardProviders.slug, provider),
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
    const selection = database.select().from(places).where(where).orderBy(...order);
    let rows: (typeof places.$inferSelect)[];
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

  async function searchMapPoints(query: Filterable & { limit?: number }) {
    const { items, total } = await search({ ...query, sort: 'name' }, MAP_LIMIT, MAP_LIMIT);
    return { items, total };
  }

  async function getPlacesBySlugs(slugs: string[]): Promise<PlaceSummary[]> {
    if (!slugs.length) return [];
    const rows = await database.select().from(places)
      .where(and(eq(places.isPublished, true), inArray(places.slug, [...new Set(slugs)])));
    const bySlug = new Map((await loadDetails(rows)).map((place) => [place.slug, toSummary(place)]));
    return slugs.flatMap((slug) => {
      const place = bySlug.get(slug);
      return place ? [place] : [];
    });
  }

  async function getCardStats(query: Omit<Filterable, 'cards'>): Promise<CardStatsResponse> {
    const now = new Date();
    const rows = await database.select().from(places).where(buildWhere({ ...query, cards: [] }));
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

  async function getPlaceBySlug(slug: string): Promise<PlaceDetails | null> {
    const rows = await database.select().from(places)
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

  return { searchPlaces, searchMapPoints, getPlaceBySlug, getPlacesBySlugs, getCardStats, getCityOptions };
}
