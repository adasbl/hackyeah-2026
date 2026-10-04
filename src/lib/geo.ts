/**
 * Pomocnicze typy i funkcje dla mapy.
 * Bbox = prostokąt widoku mapy w kolejności [west, south, east, north] (lng/lat, WGS84),
 * tak samo jak parametr `bbox` w GET /api/places.
 */
import type { CategorySlug, GeoPoint, PlaceSummary } from '@repo/types';

export type Bbox = [west: number, south: number, east: number, north: number];

/** Cała Polska – widok startowy, gdy nie ma żadnych punktów. */
export const POLAND_BBOX: Bbox = [14.07, 49.0, 24.15, 54.84];

/** Maksymalna liczba punktów pobieranych na mapę jednym zapytaniem (mapa grupuje je w klastry). */
export const MAP_LIMIT = 2000;

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

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Odległość po powierzchni Ziemi (wzór haversine), w metrach. */
export function distanceMeters(a: GeoPoint, b: GeoPoint) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const kmFmt = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });

/** 350 m · 1,2 km · 14 km */
export function formatDistance(m: number) {
  if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${m < 10_000 ? kmFmt.format(m / 1000) : Math.round(m / 1000)} km`;
}

/** Okrąg o promieniu `radius` metrów jako wielokąt GeoJSON (do narysowania zasięgu „w pobliżu”). */
export function circlePolygon(center: GeoPoint, radius: number, steps = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const dLat = (radius / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = dLat / Math.cos(rad(center.lat));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    coords.push([center.lng + dLng * Math.cos(a), center.lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } };
}
