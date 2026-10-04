/** Warstwa dostępu do danych dla frontendu, korzystająca z bazy. */
import 'server-only';
import { unstable_cache } from 'next/cache';
import { connection } from 'next/server';
import { cache } from 'react';
import type { PlacesQuery } from '@repo/types';
import { createPlacesService } from '@/server/places';

export type { CityOption } from '@/server/places';

type Filterable = Omit<PlacesQuery, 'limit' | 'offset' | 'sort'>;
type MapQuery = Filterable & { limit?: number };

/**
 * Wyniki trzymamy w Data Cache Next.js przez minutę. Zatwierdzenie zgłoszenia unieważnia cache,
 * a strona nie musi za każdym razem czekać na bazę. Po tym czasie pierwsze żądanie dostaje jeszcze
 * zapamiętany wynik, a świeży pobiera się w tle (stale-while-revalidate).
 * Aby od razu pokazać nowy import, wystarczy revalidateTag(PLACES_CACHE_TAG) albo nowy deployment.
 */
const REVALIDATE_SECONDS = 60;
export const PLACES_CACHE_TAG = 'places';

let service: ReturnType<typeof createPlacesService> | undefined;

async function getService() {
  if (!service) {
    const { db } = await import('@/db/client');
    service = createPlacesService(db);
  }
  return service;
}

/** Zapamiętana wersja funkcji serwisu; argumenty są częścią klucza cache. */
function cached<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>) {
  return unstable_cache(fn, ['places-v1', name], { revalidate: REVALIDATE_SECONDS, tags: [PLACES_CACHE_TAG] });
}

const searchPlacesCached = cached('search', async (query: PlacesQuery) => (await getService()).searchPlaces(query));
const searchMapPointsCached = cached('map', async (query: MapQuery) => (await getService()).searchMapPoints(query));
const placeBySlugCached = cached('place', async (slug: string) => (await getService()).getPlaceBySlug(slug));
const cityOptionsCached = cached('cities', async () => (await getService()).getCityOptions());
const cardStatsByCityCached = cached('card-stats', async () => (await getService()).getCardStatsByCity());

// connection(): strony renderują się przy żądaniu, a baza nie jest potrzebna podczas buildu na Vercel.
// Musi być wywołane poza unstable_cache.

export async function searchPlaces(query: PlacesQuery) {
  await connection();
  return searchPlacesCached(query);
}

// Metadane i strona korzystają z tego samego odczytu w obrębie jednego renderowania.
export const getPlaceBySlug = cache(async (slug: string) => {
  await connection();
  return placeBySlugCached(slug);
});

export const getCityOptions = cache(async () => {
  await connection();
  return cityOptionsCached();
});

export async function searchMapPoints(query: MapQuery) {
  await connection();
  // Prostokąt widoku mapy jest za każdym razem inny – takich zapytań nie zapamiętujemy.
  if (query.bbox) return (await getService()).searchMapPoints(query);
  return searchMapPointsCached(query);
}

export async function getPlacesBySlugs(slugs: string[]) {
  if (!slugs.length) return [];
  await connection();
  return (await getService()).getPlacesBySlugs(slugs);
}

/** Statystyki kart dla „całej Polski” i każdego miasta – jednym odczytem dla strony głównej. */
export async function getCardStatsByCity() {
  await connection();
  return cardStatsByCityCached();
}
