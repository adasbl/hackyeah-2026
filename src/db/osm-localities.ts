import { cleanText } from './osm-publication';
import { validPoint, type PbfEntity, type Point } from './osm-poland';
import { slugify } from '../lib/catalog';

export type Bounds = [number, number, number, number];
export interface LocalityBoundary {
  osmType: 'way' | 'relation'; osmId: number; name: string; citySlug: string;
  bounds: Bounds; outer: Point[][]; inner: Point[][];
}

/** W Polsce poziom 8 oznacza miejscowość, nie gminę (7) ani dzielnicę (9). */
export function localityName(entity: PbfEntity): string | null {
  const tags = entity.tags ?? {};
  if (entity.type === 'node' || tags.boundary !== 'administrative' || tags.admin_level !== '8'
    || tags.disused === 'yes' || tags.abandoned === 'yes') return null;
  const name = cleanText(tags['name:pl'] ?? tags.name ?? null);
  return name && slugify(name) ? name : null;
}

/** Łączy odcinki po ID końcowych węzłów, również odwrócone i nieuporządkowane. */
export function stitchRings(segments: number[][]): number[][] | null {
  const endpoints = new Map<number, number[]>();
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.length < 2) return null;
    if (segment[0] === segment.at(-1)) continue;
    for (const end of [segment[0], segment.at(-1)!]) {
      const indices = endpoints.get(end) ?? []; indices.push(i); endpoints.set(end, indices);
    }
  }
  if ([...endpoints.values()].some((indices) => indices.length !== 2)) return null;
  const used = new Set<number>();
  const rings: number[][] = [];
  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    const ring = [...segments[i]]; used.add(i);
    while (ring[0] !== ring.at(-1)) {
      const end = ring.at(-1)!;
      const next = endpoints.get(end)?.find((index) => !used.has(index));
      if (next === undefined) return null;
      const segment = segments[next]; used.add(next);
      const oriented = segment[0] === end ? segment : [...segment].reverse();
      // Nie używamy spread na całym odcinku: długie granice przekraczają limit argumentów V8.
      for (let j = 1; j < oriented.length; j++) ring.push(oriented[j]);
    }
    if (ring.length < 4 || new Set(ring.slice(0, -1)).size < 3) return null;
    rings.push(ring);
  }
  return rings;
}

function ringPosition(point: Point, ring: Point[]): 'inside' | 'outside' | 'edge' {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const cross = (point.x - a.x) * dy - (point.y - a.y) * dx;
    if (Math.abs(cross) <= 1e-10 * Math.hypot(dx, dy)
      && point.x >= Math.min(a.x, b.x) - 1e-10 && point.x <= Math.max(a.x, b.x) + 1e-10
      && point.y >= Math.min(a.y, b.y) - 1e-10 && point.y <= Math.max(a.y, b.y) + 1e-10) return 'edge';
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}

export function makeBoundary(entity: PbfEntity, name: string, segments: { outer: number[][]; inner: number[][] },
  coordinates: Map<number, Point>): LocalityBoundary | null {
  const outerRefs = stitchRings(segments.outer), innerRefs = stitchRings(segments.inner);
  if (!outerRefs?.length || !innerRefs) return null;
  const convert = (rings: number[][]): Point[][] | null => {
    const result: Point[][] = [];
    for (const refs of rings) {
      const ring: Point[] = [];
      for (const ref of refs) {
        const point = coordinates.get(ref); if (!validPoint(point)) return null;
        ring.push(point);
      }
      // Pole względem pierwszego wierzchołka ogranicza błąd numeryczny dla małych obszarów.
      const origin = ring[0];
      const area = ring.slice(1).reduce((sum, b, index) => {
        const a = ring[index]; return sum + (a.x - origin.x) * (b.y - origin.y) - (b.x - origin.x) * (a.y - origin.y);
      }, 0);
      if (Math.abs(area) < 1e-16) return null;
      result.push(ring);
    }
    return result;
  };
  const outer = convert(outerRefs), inner = convert(innerRefs);
  if (!outer || !inner) return null;
  // Odrzucamy dziury bez obszaru nadrzędnego zamiast używać niepełnej geometrii.
  if (inner.some((ring) => !outer.some((shell) => ringPosition(ring[0], shell) === 'inside'))) return null;
  const bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of outer) for (const p of ring) {
    bounds[0] = Math.min(bounds[0], p.x); bounds[1] = Math.min(bounds[1], p.y);
    bounds[2] = Math.max(bounds[2], p.x); bounds[3] = Math.max(bounds[3], p.y);
  }
  return { osmType: entity.type as 'way' | 'relation', osmId: entity.id, name, citySlug: slugify(name), bounds, outer, inner };
}

export type LocalityMatch = { reason: 'matched'; boundary: LocalityBoundary }
  | { reason: 'outside_boundaries' | 'ambiguous' | 'on_boundary' | 'invalid_location' };

export function pointInBoundary(point: Point, boundary: LocalityBoundary): 'inside' | 'outside' | 'edge' {
  const [minX, minY, maxX, maxY] = boundary.bounds;
  if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) return 'outside';
  const shells = boundary.outer.map((ring) => ringPosition(point, ring));
  if (shells.includes('edge')) return 'edge';
  if (!shells.includes('inside')) return 'outside';
  const holes = boundary.inner.map((ring) => ringPosition(point, ring));
  if (holes.includes('edge')) return 'edge';
  return holes.includes('inside') ? 'outside' : 'inside';
}

/** Indeks siatki służy tylko do wyboru kandydatów; wynik wymaga testu pełnego poligonu. */
export function createLocalityLookup(boundaries: LocalityBoundary[]) {
  const grid = new Map<string, LocalityBoundary[]>();
  const cell = (value: number) => Math.floor(value * 10);
  for (const boundary of boundaries) {
    const [minX, minY, maxX, maxY] = boundary.bounds;
    for (let x = cell(minX); x <= cell(maxX); x++) for (let y = cell(minY); y <= cell(maxY); y++) {
      const key = `${x}:${y}`, entries = grid.get(key) ?? []; entries.push(boundary); grid.set(key, entries);
    }
  }
  return (point: Point): LocalityMatch => {
    if (!validPoint(point)) return { reason: 'invalid_location' };
    const matches: LocalityBoundary[] = [];
    for (const boundary of grid.get(`${cell(point.x)}:${cell(point.y)}`) ?? []) {
      const position = pointInBoundary(point, boundary);
      if (position === 'edge') return { reason: 'on_boundary' };
      if (position === 'inside') matches.push(boundary);
    }
    if (!matches.length) return { reason: 'outside_boundaries' };
    if (new Set(matches.map((boundary) => boundary.name)).size > 1) return { reason: 'ambiguous' };
    return { reason: 'matched', boundary: matches[0] };
  };
}

export interface CityInput { id: string; slug: string; city: string | null; citySlug: string | null; location: Point }
export function planCityUpdates(rows: CityInput[], lookup: ReturnType<typeof createLocalityLookup>) {
  const updates: { before: CityInput; city: string; citySlug: string; boundary: { osmType: string; osmId: number } | null }[] = [];
  const skipped: Record<string, number> = {};
  const unresolved: { id: string; slug: string; location: Point; reason: string }[] = [];
  const skip = (reason: string, row: CityInput) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
    if (reason !== 'already_complete') unresolved.push({ id: row.id, slug: row.slug, location: row.location, reason });
  };
  for (const row of rows) {
    if (row.city?.trim()) {
      if (row.citySlug?.trim()) { skip('already_complete', row); continue; }
      const citySlug = slugify(row.city);
      if (!citySlug) { skip('invalid_city_name', row); continue; }
      updates.push({ before: row, city: row.city, citySlug, boundary: null }); continue;
    }
    // Istniejący slug może być ręczną poprawką; nie zastępujemy go dopasowaniem przestrzennym.
    if (row.citySlug?.trim()) { skip('existing_slug_without_city', row); continue; }
    const match = lookup(row.location);
    if (match.reason !== 'matched') { skip(match.reason, row); continue; }
    const boundary = match.boundary;
    updates.push({ before: row, city: boundary.name, citySlug: boundary.citySlug,
      boundary: { osmType: boundary.osmType, osmId: boundary.osmId } });
  }
  return { updates, skipped, unresolved };
}
