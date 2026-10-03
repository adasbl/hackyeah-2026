/**
 * Warstwa dostępu do danych dla frontendu.
 * TERAZ: filtruje dane z mocka (src/mocks/places.ts).
 * PÓŹNIEJ: podmienić ciało funkcji na wywołanie serwisu z src/server/places (Osoba 2)
 * albo fetch do GET /api/places – sygnatury i typy zostają takie same.
 */
import type { PlaceDetails, PlaceSummary, PlacesQuery, PlacesResponse } from '@repo/types';
import { ALL_CITIES_SLUG, CITIES, slugify } from '@/lib/catalog';
import { isInBbox } from '@/lib/geo';
import { MOCK_PLACES } from '@/mocks/places';

import { connection } from 'next/server';
import type { PlacesQuery } from '@repo/types';
import { db } from '@/db/client';
import { createPlacesService } from '@/server/places';

export type { CityOption } from '@/server/places';

  const matches = MOCK_PLACES.filter((p) => {
    if (query.city && query.city !== ALL_CITIES_SLUG && p.address.citySlug !== query.city) return false;
    if (query.bbox && !isInBbox(p.location, query.bbox)) return false;
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

// Odczyt przy każdym żądaniu, także na stronie głównej po nowym imporcie.
export async function searchPlaces(query: PlacesQuery) {
  await connection();
  return service.searchPlaces(query);
}

export async function getPlaceBySlug(slug: string) {
  await connection();
  return service.getPlaceBySlug(slug);
}

export async function getCityOptions() {
  await connection();
  return service.getCityOptions();
}
