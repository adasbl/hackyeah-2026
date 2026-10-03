/** Warstwa dostępu do danych dla frontendu, korzystająca z bazy. */
import 'server-only';
import { connection } from 'next/server';
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

export async function getCityOptions() {
  return (await getService()).getCityOptions();
}
