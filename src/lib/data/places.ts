/** Warstwa dostępu do danych dla frontendu, korzystająca z bazy. */
import 'server-only';
import { connection } from 'next/server';
import { cache } from 'react';
import type { PlacesQuery } from '@repo/types';
import { createPlacesService } from '@/server/places';

export type { CityOption } from '@/server/places';

let service: ReturnType<typeof createPlacesService> | undefined;

async function getService() {
  // Baza jest potrzebna dopiero przy żądaniu, nie podczas buildu na Vercel.
  await connection();
  if (!service) {
    const { db } = await import('@/db/client');
    service = createPlacesService(db);
  }
  return service;
}

// Odczyt przy każdym żądaniu, także na stronie głównej po nowym imporcie.
export async function searchPlaces(query: PlacesQuery) {
  return (await getService()).searchPlaces(query);
}

export async function getPlaceBySlug(slug: string) {
  return (await getService()).getPlaceBySlug(slug);
}

// Metadane i strona korzystają z tego samego odczytu w obrębie jednego renderowania.
export const getCityOptions = cache(async () => {
  return (await getService()).getCityOptions();
});

type Filterable = Omit<PlacesQuery, 'limit' | 'offset' | 'sort'>;

export async function searchMapPoints(query: Filterable & { limit?: number }) {
  return (await getService()).searchMapPoints(query);
}

export async function getPlacesBySlugs(slugs: string[]) {
  if (!slugs.length) return [];
  return (await getService()).getPlacesBySlugs(slugs);
}

export async function getCardStats(query: Omit<Filterable, 'cards'>) {
  return (await getService()).getCardStats(query);
}
