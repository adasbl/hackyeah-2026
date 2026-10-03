'use server';

/**
 * Server Action dla mapy: zwraca obiekty w widocznym prostokącie (bbox) + aktywne filtry.
 * Korzysta z tej samej funkcji searchPlaces co lista, więc gdy Osoba 2 podmieni ją
 * na bazę / GET /api/places, mapa zacznie działać na prawdziwych danych bez zmian tutaj.
 */
import { z } from 'zod';
import { CARD_PROVIDER_SLUGS, CATEGORY_SLUGS } from '@repo/types';
import { searchPlaces } from '@/lib/data/places';
import { MAP_LIMIT, toMapPlace, type MapPlacesResult } from '@/lib/geo';

const lng = z.number().min(-180).max(180);
const lat = z.number().min(-90).max(90);

const inputSchema = z.object({
  bbox: z.tuple([lng, lat, lng, lat]).refine(([w, s, e, n]) => w <= e && s <= n, 'Nieprawidłowy bbox'),
  category: z.enum(CATEGORY_SLUGS).optional(),
  cards: z.array(z.enum(CARD_PROVIDER_SLUGS)).max(CARD_PROVIDER_SLUGS.length).default([]),
  q: z.string().trim().max(100).optional(),
});

export type MapPlacesInput = z.input<typeof inputSchema>;

export async function getMapPlaces(input: MapPlacesInput): Promise<MapPlacesResult> {
  // Server Action to publiczny endpoint – wejście zawsze walidujemy.
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error('Nieprawidłowe parametry mapy');

  const { items, total } = await searchPlaces({ ...parsed.data, limit: MAP_LIMIT });
  return { items: items.map(toMapPlace), total };
}
