/** Warstwa dostępu do danych dla frontendu, korzystająca z bazy. */
import { connection } from 'next/server';
import type { PlacesQuery } from '@repo/types';
import { db } from '@/db/client';
import { createPlacesService } from '@/server/places';

export type { CityOption } from '@/server/places';

const service = createPlacesService(db);

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
