import { slugify } from '../lib/catalog';
import { pointInBoundary, type LocalityBoundary, type Bounds } from './osm-localities';
import { validPoint, type PbfEntity, type Point } from './osm-poland';
import { normalizePolishPostcode } from './osm-postcode-format';
export { normalizePolishPostcode } from './osm-postcode-format';

export interface PostcodeTarget { slug: string; location: Point }
export interface PostcodeAddress {
  osmType: 'node'; osmId: number; postcode: string; location: Point;
  street: string; houseNumber: string; city: string | null;
}
export interface PostcodeArea { kind: 'address_area' | 'postal_boundary'; postcode: string; geometry: LocalityBoundary }
export function postcodeArea(entity: PbfEntity): { kind: PostcodeArea['kind']; postcode: string } | null {
  const tags = entity.tags ?? {};
  if (entity.type === 'node' || (tags['addr:country'] && tags['addr:country'].toUpperCase() !== 'PL')
    || tags.disused === 'yes' || tags.abandoned === 'yes') return null;
  const postal = normalizePolishPostcode(tags.postal_code);
  if (postal && ['postal_code', 'administrative'].includes(tags.boundary)) return { kind: 'postal_boundary', postcode: postal };
  const address = normalizePolishPostcode(tags['addr:postcode']);
  const polygon = entity.type === 'relation' ? tags.type === 'multipolygon'
    : entity.refs && entity.refs.length >= 4 && entity.refs[0] === entity.refs.at(-1);
  if (address && polygon && ((tags.building && tags.building !== 'no') || tags.area === 'yes'
    || (tags.amenity && tags.amenity !== 'no') || (tags.leisure && tags.leisure !== 'no'))) return { kind: 'address_area', postcode: address };
  return null;
}

export function distanceMeters(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const lat = (b.y - a.y) * rad, lon = (b.x - a.x) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.y * rad) * Math.cos(b.y * rad) * Math.sin(lon / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Mała siatka targetów ogranicza cache do geometrii potrzebnej aktualnym obiektom. */
export function createTargetIndex(targets: PostcodeTarget[]) {
  const grid = new Map<string, PostcodeTarget[]>(), cell = (value: number) => Math.floor(value * 100);
  for (const target of targets) {
    const key = `${cell(target.location.x)}:${cell(target.location.y)}`;
    const entries = grid.get(key) ?? []; entries.push(target); grid.set(key, entries);
  }
  return (bounds: Bounds) => {
    const [minX, minY, maxX, maxY] = bounds;
    const cells = (cell(maxX) - cell(minX) + 1) * (cell(maxY) - cell(minY) + 1);
    const result: PostcodeTarget[] = [];
    if (cells > 10_000) return targets.filter((t) => t.location.x >= minX && t.location.x <= maxX && t.location.y >= minY && t.location.y <= maxY);
    for (let x = cell(minX); x <= cell(maxX); x++) for (let y = cell(minY); y <= cell(maxY); y++) {
      for (const t of grid.get(`${x}:${y}`) ?? []) {
        if (t.location.x >= minX && t.location.x <= maxX && t.location.y >= minY && t.location.y <= maxY) result.push(t);
      }
    }
    return result;
  };
}

export interface PostcodeInput extends PostcodeTarget {
  id: string; postalCode: string | null; city: string | null;
  osmType: PbfEntity['type'] | null; osmId: number | null;
  addressStreet: string | null; addressHouseNumber: string | null; osmTags: Record<string, string>;
}
export function createPostcodeLookup(areas: PostcodeArea[], addresses: PostcodeAddress[]) {
  const grid = new Map<string, PostcodeArea[]>(), cell = (n: number) => Math.floor(n * 10);
  for (const area of areas) {
    const [minX, minY, maxX, maxY] = area.geometry.bounds;
    for (let x = cell(minX); x <= cell(maxX); x++) for (let y = cell(minY); y <= cell(maxY); y++) {
      const key = `${x}:${y}`, entries = grid.get(key) ?? []; entries.push(area); grid.set(key, entries);
    }
  }
  const houseKey = (number: string) => number.trim().toLowerCase().replace(/\s+/g, '');
  const addressIndex = new Map<string, PostcodeAddress[]>();
  for (const address of addresses) {
    const key = `${slugify(address.street)}:${houseKey(address.houseNumber)}`;
    const entries = addressIndex.get(key) ?? []; entries.push(address); addressIndex.set(key, entries);
  }
  return (row: PostcodeInput) => {
    if (row.osmTags['addr:country'] && row.osmTags['addr:country'].toUpperCase() !== 'PL') return { reason: 'unsupported_country' as const };
    const sources: { method: 'own_osm_tag' | 'exact_address' | PostcodeArea['kind']; postcode: string; osmType: string; osmId: number }[] = [];
    const own = normalizePolishPostcode(row.osmTags['addr:postcode']);
    // Bezpośredni adres obiektu ma pierwszeństwo przed danymi o otoczeniu.
    if (own && row.osmType && row.osmId) return { reason: 'matched' as const, postcode: own, sources: [{ method: 'own_osm_tag' as const, postcode: own,
      osmType: row.osmType, osmId: row.osmId }] };
    if (!validPoint(row.location)) return { reason: 'invalid_location' as const };
    if (row.addressStreet?.trim() && row.addressHouseNumber?.trim()) {
      for (const address of addressIndex.get(`${slugify(row.addressStreet)}:${houseKey(row.addressHouseNumber)}`) ?? []) {
        if (row.city?.trim() && address.city?.trim() && slugify(row.city) !== slugify(address.city)) continue;
        if (distanceMeters(row.location, address.location) <= 150) sources.push({ method: 'exact_address', postcode: address.postcode, osmType: address.osmType, osmId: address.osmId });
      }
    }
    let edge = false;
    for (const area of grid.get(`${cell(row.location.x)}:${cell(row.location.y)}`) ?? []) {
      const position = pointInBoundary(row.location, area.geometry);
      if (position === 'edge') edge = true;
      if (position === 'inside') sources.push({ method: area.kind, postcode: area.postcode,
        osmType: area.geometry.osmType, osmId: area.geometry.osmId });
    }
    if (new Set(sources.map((s) => s.postcode)).size > 1) return { reason: 'conflicting_postcodes' as const };
    if (edge) return { reason: 'on_boundary' as const };
    if (!sources.length) return { reason: 'no_matching_source' as const };
    return { reason: 'matched' as const, postcode: sources[0].postcode, sources };
  };
}

export function planPostcodeUpdates(rows: PostcodeInput[], cache: {
  targets: PostcodeTarget[]; areas: PostcodeArea[]; addresses: PostcodeAddress[];
}) {
  const targets = new Map(cache.targets.map((target) => [target.slug, target.location]));
  const lookup = createPostcodeLookup(cache.areas, cache.addresses);
  const updates: { before: PostcodeInput; postalCode: string; sources: NonNullable<ReturnType<typeof lookup>['sources']> }[] = [];
  const skipped: Record<string, number> = {};
  const unresolved: { id: string; slug: string; reason: string }[] = [];
  let invalidExisting = 0;
  for (const row of rows) {
    let reason: string | null = null;
    if (row.postalCode?.trim()) {
      reason = 'already_present'; if (!/^\d{2}-\d{3}$/.test(row.postalCode)) invalidExisting++;
    } else {
      const target = targets.get(row.slug);
      if (!normalizePolishPostcode(row.osmTags['addr:postcode'])
        && (!target || target.x !== row.location.x || target.y !== row.location.y)) reason = 'cache_target_missing_or_moved';
      else {
        const match = lookup(row);
        if (match.reason === 'matched') updates.push({ before: row, postalCode: match.postcode, sources: match.sources });
        else reason = match.reason;
      }
    }
    if (reason) {
      skipped[reason] = (skipped[reason] ?? 0) + 1;
      if (reason !== 'already_present') unresolved.push({ id: row.id, slug: row.slug, reason });
    }
  }
  return { updates, skipped, unresolved, invalidExisting };
}
