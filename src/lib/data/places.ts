/**
 * Warstwa dostępu do danych dla frontendu.
 * TERAZ: filtruje dane z mocka (src/mocks/places.ts).
 * PÓŹNIEJ: podmienić ciało funkcji na wywołanie serwisu z src/server/places (Osoba 2)
 * albo fetch do GET /api/places – sygnatury i typy zostają takie same.
 */
import type { PlaceDetails, PlaceSummary, PlacesQuery, PlacesResponse } from '@repo/types';
import { ALL_CITIES_SLUG, CITIES, slugify } from '@/lib/catalog';
import { MOCK_PLACES } from '@/mocks/places';

const ACCEPTING = new Set(['accepted', 'conditional']);

function toSummary(p: PlaceDetails): PlaceSummary {
  const { id, slug, name, category, address, location, cards, priceFrom, updatedAt } = p;
  return { id, slug, name, category, address, location, cards, priceFrom, updatedAt };
}

export async function searchPlaces(query: PlacesQuery): Promise<PlacesResponse> {
  const limit = Math.min(query.limit ?? 20, 100);
  const offset = query.offset ?? 0;
  const q = query.q ? slugify(query.q) : '';

  const matches = MOCK_PLACES.filter((p) => {
    if (query.city && query.city !== ALL_CITIES_SLUG && p.address.citySlug !== query.city) return false;
    if (query.category && p.category !== query.category) return false;
    if (query.cards?.length) {
      const ok = query.cards.every((provider) => p.cards.some((c) => c.provider === provider && ACCEPTING.has(c.status)));
      if (!ok) return false;
    }
    if (q && !slugify(`${p.name} ${p.address.street} ${p.address.city}`).includes(q)) return false;
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name, 'pl'));

  return { items: matches.slice(offset, offset + limit).map(toSummary), total: matches.length, limit, offset };
}

export async function getPlaceBySlug(slug: string): Promise<PlaceDetails | null> {
  return MOCK_PLACES.find((p) => p.slug === slug) ?? null;
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
