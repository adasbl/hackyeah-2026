/**
 * Warstwa dostępu do danych dla frontendu.
 * TERAZ: filtruje dane z mocka (src/mocks/places.ts).
 * PÓŹNIEJ: podmienić ciało funkcji na wywołanie serwisu z src/server/places (Osoba 2)
 * albo fetch do GET /api/places – sygnatury i typy zostają takie same.
 */
import type { CardStatsResponse, PlaceDetails, PlaceSummary, PlacesQuery, PlacesResponse } from '@repo/types';
import { ALL_CITIES_SLUG, CARD_PROVIDERS, CITIES, slugify } from '@/lib/catalog';
import { distanceMeters, isInBbox } from '@/lib/geo';
import { isOpenNow } from '@/lib/opening-hours';
import { MOCK_PLACES } from '@/mocks/places';

const ACCEPTING = new Set(['accepted', 'conditional']);

/** Limit publicznego API listy. */
const API_MAX_LIMIT = 100;
/** Mapa grupuje pinezki w klastry, więc potrzebuje wszystkich punktów z widoku – osobny, wyższy limit. */
const MAP_MAX_LIMIT = 2000;

function toSummary(p: PlaceDetails, distance?: number): PlaceSummary {
  const { id, slug, name, category, address, location, cards, priceFrom, openingHours, updatedAt } = p;
  return {
    id,
    slug,
    name,
    category,
    address,
    location,
    cards,
    priceFrom,
    openingHours,
    ...(distance !== undefined ? { distanceMeters: Math.round(distance) } : {}),
    updatedAt,
  };
}

type Filterable = Omit<PlacesQuery, 'limit' | 'offset' | 'sort'>;

/** Wspólne filtrowanie dla listy, mapy i statystyk. Zwraca obiekty z policzoną odległością (gdy jest punkt). */
function filterPlaces(query: Filterable, now = new Date()) {
  const q = query.q ? slugify(query.q) : '';
  const point = query.lat !== undefined && query.lng !== undefined ? { lat: query.lat, lng: query.lng } : null;
  const out: { place: PlaceDetails; distance?: number }[] = [];

  for (const p of MOCK_PLACES) {
    if (query.city && query.city !== ALL_CITIES_SLUG && p.address.citySlug !== query.city) continue;
    if (query.bbox && !isInBbox(p.location, query.bbox)) continue;
    if (query.category && p.category !== query.category) continue;
    if (query.cards?.length) {
      const ok = query.cards.every((provider) => p.cards.some((c) => c.provider === provider && ACCEPTING.has(c.status)));
      if (!ok) continue;
    }
    if (q && !slugify(`${p.name} ${p.address.street} ${p.address.city}`).includes(q)) continue;
    if (query.openNow && !isOpenNow(p.openingHours, now)) continue;
    const distance = point ? distanceMeters(point, p.location) : undefined;
    if (distance !== undefined && query.radius && distance > query.radius) continue;
    out.push({ place: p, distance });
  }
  return out;
}

function sortResults(rows: ReturnType<typeof filterPlaces>, sort: PlacesQuery['sort']) {
  const byName = (a: PlaceDetails, b: PlaceDetails) => a.name.localeCompare(b.name, 'pl');
  if (sort === 'distance') return rows.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0) || byName(a.place, b.place));
  return rows.sort((a, b) => byName(a.place, b.place));
}

export async function searchPlaces(query: PlacesQuery): Promise<PlacesResponse> {
  const limit = Math.min(query.limit ?? 20, API_MAX_LIMIT);
  const offset = query.offset ?? 0;
  const rows = sortResults(filterPlaces(query), query.sort);
  return {
    items: rows.slice(offset, offset + limit).map((r) => toSummary(r.place, r.distance)),
    total: rows.length,
    limit,
    offset,
  };
}

/** Punkty na mapę – bez limitu 100, bo mapa sama grupuje je w klastry. */
export async function searchMapPoints(query: Filterable & { limit?: number }): Promise<{ items: PlaceSummary[]; total: number }> {
  const rows = sortResults(filterPlaces(query), 'name');
  const limit = Math.min(query.limit ?? MAP_MAX_LIMIT, MAP_MAX_LIMIT);
  return { items: rows.slice(0, limit).map((r) => toSummary(r.place, r.distance)), total: rows.length };
}

export async function getPlaceBySlug(slug: string): Promise<PlaceDetails | null> {
  return MOCK_PLACES.find((p) => p.slug === slug) ?? null;
}

/** Obiekty po slugach (ulubione), w kolejności podanych slugów; nieistniejące są pomijane. */
export async function getPlacesBySlugs(slugs: string[]): Promise<PlaceSummary[]> {
  const bySlug = new Map(MOCK_PLACES.map((p) => [p.slug, p]));
  return slugs.flatMap((s) => {
    const p = bySlug.get(s);
    return p ? [toSummary(p)] : [];
  });
}

/**
 * Porównanie kart: ile obiektów (przy tych samych filtrach, ale BEZ filtra kart) ma dany status każdej karty.
 * Filtr kart pomijamy celowo – porównujemy karty między sobą.
 */
export async function getCardStats(query: Omit<Filterable, 'cards'>): Promise<CardStatsResponse> {
  const rows = filterPlaces({ ...query, cards: [] });
  const providers = CARD_PROVIDERS.map(({ slug }) => {
    const counts = { provider: slug, accepted: 0, conditional: 0, notAccepted: 0, unknown: 0 };
    for (const { place } of rows) {
      const status = place.cards.find((c) => c.provider === slug)?.status ?? 'unknown';
      if (status === 'accepted') counts.accepted++;
      else if (status === 'conditional') counts.conditional++;
      else if (status === 'not_accepted') counts.notAccepted++;
      else counts.unknown++;
    }
    return counts;
  });
  return { total: rows.length, providers };
}

export interface CityOption {
  slug: string;
  name: string;
  count: number;
}

/** Miasta do listy rozwijanej (z liczbą obiektów). Pierwsza pozycja: cała Polska. */
export async function getCityOptions(): Promise<CityOption[]> {
  const cities = CITIES.map((c) => ({ ...c, count: MOCK_PLACES.filter((p) => p.address.citySlug === c.slug).length }));
  return [{ slug: ALL_CITIES_SLUG, name: 'Cała Polska', count: MOCK_PLACES.length }, ...cities];
}
