'use server';

/** Server Action dla strony „Ulubione”: slugi trzymamy w przeglądarce, dane obiektów pobieramy z serwera. */
import { z } from 'zod';
import type { PlaceSummary } from '@repo/types';
import { getPlacesBySlugs } from '@/lib/data/places';

const inputSchema = z.array(z.string().regex(/^[a-z0-9-]{1,120}$/)).max(200);

export async function getFavoritePlaces(slugs: string[]): Promise<PlaceSummary[]> {
  const parsed = inputSchema.safeParse(slugs);
  if (!parsed.success) return [];
  return getPlacesBySlugs(parsed.data);
}
