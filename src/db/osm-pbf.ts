import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform, type TransformCallback } from 'node:stream';
import { OSMTransform, type OSMOptions } from 'osm-pbf-parser-node';
import { classifyPolandSports, normalizePolandPlace, polandExclusionReason, validPoint,
  POLAND_IMPORT_CATEGORIES, type ImportCategory, type PbfEntity, type Point } from './osm-poland';

class SafePbfTransform extends OSMTransform {
  _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
    try { super._transform(chunk, encoding, callback); } catch (error) { callback(error as Error); }
  }
  _flush(callback: TransformCallback) {
    try { super._flush(callback); } catch (error) { callback(error as Error); }
  }
}

export async function scanPbf(file: string, consume: (entity: PbfEntity) => void, options: OSMOptions = {}) {
  const hash = createHash('sha256');
  const digest = new Transform({ transform(chunk: Buffer, _encoding, callback) { hash.update(chunk); callback(null, chunk); } });
  await pipeline(createReadStream(file), digest, new SafePbfTransform(options), async (source) => {
    for await (const batch of source) {
      for (const value of batch as (PbfEntity | { required_features?: string[] })[]) {
        if (!('type' in value)) {
          if (value.required_features?.some((feature) => !['OsmSchema-V0.6', 'DenseNodes', 'LocationsOnWays'].includes(feature))) throw new Error('OSM_UNSUPPORTED_PBF_FEATURE');
          continue;
        }
        if (!Number.isSafeInteger(value.id) || value.id <= 0) throw new Error('OSM_INVALID_PBF_ID');
        consume(value);
      }
    }
  });
  return hash.digest('hex');
}

type Bounds = [number, number, number, number];
function mergeBounds(bounds: Bounds | null, point: Point): Bounds {
  return bounds ? [Math.min(bounds[0], point.x), Math.min(bounds[1], point.y),
    Math.max(bounds[2], point.x), Math.max(bounds[3], point.y)] : [point.x, point.y, point.x, point.y];
}
function combineBounds(a: Bounds | null, b: Bounds): Bounds {
  return mergeBounds(mergeBounds(a, { x: b[0], y: b[1] }), { x: b[2], y: b[3] });
}

/** W pamięci zostają tylko kandydaci i geometria, do której faktycznie się odwołują. */
export async function preparePolandPbf(file: string, options: {
  categories?: readonly ImportCategory[]; progress?: (message: string) => void;
} = {}) {
  const selected = new Set(options.categories ?? POLAND_IMPORT_CATEGORIES);
  const candidates = new Map<string, { entity: PbfEntity; categories: ImportCategory[] }>();
  const ways = new Map<number, number[]>();
  const relations = new Map<number, NonNullable<PbfEntity['members']>>();
  const neededWays = new Set<number>(), neededRelations = new Set<number>(), neededNodes = new Set<number>();
  const coordinates = new Map<number, Point>();
  const excluded: Record<string, number> = {};
  const exclude = (reason: string) => { excluded[reason] = (excluded[reason] ?? 0) + 1; };
  const registerWay = (id: number, refs: number[]) => {
    ways.set(id, refs); refs.forEach((ref) => neededNodes.add(ref));
  };
  const registerRelation = (id: number, members: NonNullable<PbfEntity['members']>) => {
    relations.set(id, members);
    for (const member of members) {
      if (member.type === 'node') neededNodes.add(member.ref);
      else if (member.type === 'way') neededWays.add(member.ref);
      else neededRelations.add(member.ref);
    }
  };
  options.progress?.('1: wyszukiwanie obiektów i kategorii');
  let scanned = 0;
  const sourceHash = await scanPbf(file, (entity) => {
    scanned++;
    if (scanned % 5_000_000 === 0) options.progress?.(`Przejrzano ${scanned} elementów; kandydaci: ${candidates.size}`);
    const tags = entity.tags ?? {};
    // Większość węzłów PBF służy tylko do geometrii dróg/budynków.
    if (!tags.leisure && !tags.sport && !tags.amenity && !tags.club && !tags.climbing) return;
    const categories = classifyPolandSports(tags).filter((category) => selected.has(category));
    if (!categories.length) return;
    const reason = polandExclusionReason(tags);
    if (reason) { exclude(reason); return; }
    const key = `${entity.type}/${entity.id}`;
    // Geofabrik jest snapshotem, a nie historią: powtórzone ID oznacza błędny format wejścia.
    if (candidates.has(key)) throw new Error('OSM_DUPLICATE_PBF_ENTITY');
    candidates.set(key, { entity, categories });
    if (entity.type === 'way') registerWay(entity.id, entity.refs ?? []);
    if (entity.type === 'relation') registerRelation(entity.id, entity.members ?? []);
  // Publiczne PBF Geofabrik mają niepełne tablice metadanych; parser nie obsługuje ich z withInfo=true.
  // Pochodzenie całego importu identyfikujemy hashem pliku, bez danych autorów edycji.
  }, { withInfo: false });
  if (!candidates.size) throw new Error('OSM_NO_MATCHING_SPORTS_PLACES');

  // Zagnieżdżone relacje mogą wymagać dodatkowego przejścia (ways są zwykle przed relations).
  for (let round = 1; round <= 16; round++) {
    const missingWays = [...neededWays].filter((id) => !ways.has(id));
    const missingRelations = [...neededRelations].filter((id) => !relations.has(id));
    if (!missingWays.length && !missingRelations.length) break;
    options.progress?.(`Geometria ${round}: brakujące ways ${missingWays.length}, relations ${missingRelations.length}`);
    let found = 0;
    const passHash = await scanPbf(file, (entity) => {
      if (entity.type === 'way' && neededWays.has(entity.id) && !ways.has(entity.id)) {
        registerWay(entity.id, entity.refs ?? []); found++;
      } else if (entity.type === 'relation' && neededRelations.has(entity.id) && !relations.has(entity.id)) {
        registerRelation(entity.id, entity.members ?? []); found++;
      }
    }, { withTags: false });
    if (passHash !== sourceHash) throw new Error('OSM_PBF_CHANGED_DURING_READ');
    if (!found) break;
  }
  if (neededNodes.size) {
    options.progress?.(`Współrzędne: ${neededNodes.size} potrzebnych węzłów`);
    const passHash = await scanPbf(file, (entity) => {
      if (entity.type !== 'node' || !neededNodes.has(entity.id)) return;
      const point = { x: entity.lon!, y: entity.lat! };
      if (validPoint(point)) coordinates.set(entity.id, point);
    }, { withTags: false });
    if (passHash !== sourceHash) throw new Error('OSM_PBF_CHANGED_DURING_READ');
  }
  function geometry(type: PbfEntity['type'], id: number, visiting = new Set<number>()): Bounds | null {
    if (type === 'node') {
      const point = coordinates.get(id);
      return point ? mergeBounds(null, point) : null;
    }
    if (type === 'way') {
      const refs = ways.get(id);
      if (!refs?.length) return null;
      let bounds: Bounds | null = null;
      for (const ref of refs) {
        const point = coordinates.get(ref);
        if (!point) return null; // Nie wyznaczamy środka z fragmentu uszkodzonej geometrii.
        bounds = mergeBounds(bounds, point);
      }
      return bounds;
    }
    if (visiting.has(id) || visiting.size >= 16) return null;
    const members = relations.get(id);
    if (!members?.length) return null;
    visiting.add(id);
    let bounds: Bounds | null = null;
    for (const member of members) {
      const child = geometry(member.type, member.ref, visiting);
      if (!child) { visiting.delete(id); return null; }
      bounds = combineBounds(bounds, child);
    }
    visiting.delete(id);
    return bounds;
  }
  const records: ReturnType<typeof normalizePolandPlace>[] = [];
  const multipleCategories: { slug: string; primary: ImportCategory; categories: ImportCategory[] }[] = [];
  let approximateLocations = 0;
  for (const { entity, categories } of candidates.values()) {
    let point: Point;
    if (entity.type === 'node') point = { x: entity.lon!, y: entity.lat! };
    else {
      const bounds = geometry(entity.type, entity.id);
      if (!bounds) { exclude('incomplete_geometry'); continue; }
      point = { x: (bounds[0] + bounds[2]) / 2, y: (bounds[1] + bounds[3]) / 2 };
      approximateLocations++;
    }
    if (!validPoint(point)) { exclude('invalid_location'); continue; }
    const record = normalizePolandPlace(entity, point, categories[0]);
    records.push(record);
    if (categories.length > 1) multipleCategories.push({ slug: record.slug, primary: categories[0], categories });
  }
  records.sort((a, b) => a.slug.localeCompare(b.slug));
  return { sourceHash, records, summary: { scanned, candidates: candidates.size, accepted: records.length,
    excluded, approximateLocations, missingCity: records.filter((record) => !record.city).length,
    missingAddress: records.filter((record) => !record.addressStreet || !record.addressHouseNumber).length,
    byCategory: Object.fromEntries(POLAND_IMPORT_CATEGORIES.map((category) => [category, records.filter((record) => record.category === category).length])),
  }, multipleCategories };
}
