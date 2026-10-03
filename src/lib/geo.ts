/**
 * Pomocnicze typy i funkcje dla mapy.
 * Bbox = prostokąt widoku mapy w kolejności [west, south, east, north] (lng/lat, WGS84),
 * tak samo jak parametr `bbox` w GET /api/places (docs/api-contract.md).
 */
import type { CategorySlug, GeoPoint, PlaceSummary } from '@repo/types';

export type Bbox = [west: number, south: number, east: number, north: number];

/** Cała Polska – widok startowy, gdy nie ma żadnych punktów. */
export const POLAND_BBOX: Bbox = [14.07, 49.0, 24.15, 54.84];

/** Maksymalna liczba punktów pobieranych na mapę jednym zapytaniem (limit API = 100). */
export const MAP_LIMIT = 100;

/** Lekka wersja obiektu – tylko to, czego potrzebuje pinezka i dymek na mapie. */
export interface MapPlace {
  id: string;
  slug: string;
  name: string;
  category: CategorySlug;
  street: string;
  city: string;
  location: GeoPoint;
}

export interface MapPlacesResult {
  items: MapPlace[];
  total: number;
}

export function toMapPlace(p: PlaceSummary): MapPlace {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category,
    street: p.address.street,
    city: p.address.city,
    location: p.location,
  };
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Przycina granice widoku do poprawnego zakresu i zaokrągla (mapa potrafi zwrócić np. lng = -200). */
export function normalizeBbox([w, s, e, n]: Bbox): Bbox {
  return [round(clamp(w, -180, 180)), round(clamp(s, -90, 90)), round(clamp(e, -180, 180)), round(clamp(n, -90, 90))];
}

export function isInBbox({ lat, lng }: GeoPoint, [w, s, e, n]: Bbox) {
  return lng >= w && lng <= e && lat >= s && lat <= n;
}

/** Prostokąt obejmujący wszystkie punkty; przy jednym punkcie dodaje mały margines. */
export function bboxOf(points: GeoPoint[]): Bbox {
  if (points.length === 0) return POLAND_BBOX;
  const lngs = points.map((p) => p.lng);
  const lats = points.map((p) => p.lat);
  const pad = points.length === 1 ? 0.01 : 0;
  return [Math.min(...lngs) - pad, Math.min(...lats) - pad, Math.max(...lngs) + pad, Math.max(...lats) + pad];
}
