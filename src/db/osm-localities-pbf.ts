import { scanPbf } from './osm-pbf';
import { localityName, makeBoundary, type LocalityBoundary } from './osm-localities';
import { validPoint, type PbfEntity, type Point } from './osm-poland';

export async function preparePbfAreas(file: string, pickName: (entity: PbfEntity) => string | null,
  progress?: (message: string) => void, options: {
    onEntity?: (entity: PbfEntity) => void; keepBoundary?: (boundary: LocalityBoundary) => boolean;
  } = {}) {
  const candidates: { entity: PbfEntity; name: string }[] = [];
  const ways = new Map<number, number[]>();
  const relations = new Map<number, NonNullable<PbfEntity['members']>>();
  const neededWays = new Set<number>(), neededRelations = new Set<number>(), neededNodes = new Set<number>();
  const coordinates = new Map<number, Point>();
  const isGeometry = (role: string) => ['', 'outer', 'inner'].includes(role);
  const registerRelation = (id: number, members: NonNullable<PbfEntity['members']>) => {
    relations.set(id, members);
    for (const member of members) {
      if (!isGeometry(member.role)) continue;
      if (member.type === 'way') neededWays.add(member.ref);
      else if (member.type === 'relation') neededRelations.add(member.ref);
    }
  };
  const registerWay = (id: number, refs: number[]) => {
    ways.set(id, refs); for (const ref of refs) neededNodes.add(ref);
  };
  progress?.('1: wyszukiwanie obszarów OSM');
  let scanned = 0;
  const sourceHash = await scanPbf(file, (entity) => {
    scanned++;
    if (scanned % 10_000_000 === 0) progress?.(`Przejrzano ${scanned} elementów; granice: ${candidates.length}`);
    options.onEntity?.(entity);
    const name = pickName(entity); if (!name) return;
    // Do odtworzenia poligonu nie potrzebujemy wszystkich tagów kandydata.
    candidates.push({ entity: { type: entity.type, id: entity.id }, name });
    if (entity.type === 'way') registerWay(entity.id, entity.refs ?? []);
    else registerRelation(entity.id, entity.members ?? []);
  }, { withInfo: false });
  for (let round = 1; round <= 16; round++) {
    const missingWays = [...neededWays].filter((id) => !ways.has(id)).length;
    const missingRelations = [...neededRelations].filter((id) => !relations.has(id)).length;
    if (!missingWays && !missingRelations) break;
    progress?.(`Geometria ${round}: odcinki ${missingWays}, relacje ${missingRelations}`);
    let found = 0, passScanned = 0;
    const passHash = await scanPbf(file, (entity) => {
      if (++passScanned % 20_000_000 === 0) progress?.(`Geometria ${round}: przejrzano ${passScanned} elementów`);
      if (entity.type === 'way' && neededWays.has(entity.id) && !ways.has(entity.id)) {
        registerWay(entity.id, entity.refs ?? []); found++;
      } else if (entity.type === 'relation' && neededRelations.has(entity.id) && !relations.has(entity.id)) {
        registerRelation(entity.id, entity.members ?? []); found++;
      }
    }, { withTags: false, withInfo: false });
    if (passHash !== sourceHash) throw new Error('OSM_PBF_CHANGED_DURING_READ');
    if (!found) break;
  }
  progress?.(`Współrzędne obszarów: ${neededNodes.size} węzłów`);
  let coordinateScanned = 0;
  const passHash = neededNodes.size ? await scanPbf(file, (entity) => {
    if (++coordinateScanned % 20_000_000 === 0) progress?.(`Współrzędne: przejrzano ${coordinateScanned} elementów; odczytano ${coordinates.size} węzłów granic`);
    if (entity.type !== 'node' || !neededNodes.has(entity.id)) return;
    const point = { x: entity.lon!, y: entity.lat! };
    if (validPoint(point)) coordinates.set(entity.id, point);
  }, { withTags: false, withInfo: false }) : sourceHash;
  if (passHash !== sourceHash) throw new Error('OSM_PBF_CHANGED_DURING_READ');
  function collect(type: 'way' | 'relation', id: number, inner = false, visiting = new Set<number>()): { outer: number[][]; inner: number[][] } | null {
    if (type === 'way') {
      const refs = ways.get(id); return refs ? { outer: inner ? [] : [refs], inner: inner ? [refs] : [] } : null;
    }
    if (visiting.has(id) || visiting.size >= 16) return null;
    const members = relations.get(id); if (!members?.length) return null;
    visiting.add(id);
    const result: { outer: number[][]; inner: number[][] } = { outer: [], inner: [] };
    for (const member of members) {
      if (!isGeometry(member.role)) continue; // label/admin_centre/subarea nie są fragmentem obrysu.
      if (member.type === 'node') { visiting.delete(id); return null; }
      const child = collect(member.type, member.ref, inner !== (member.role === 'inner'), visiting);
      if (!child) { visiting.delete(id); return null; }
      result.outer.push(...child.outer); result.inner.push(...child.inner);
    }
    visiting.delete(id); return result;
  }
  const boundaries: LocalityBoundary[] = [];
  const rejected: { osmType: string; osmId: number; name: string }[] = [];
  for (const { entity, name } of candidates) {
    const segments = collect(entity.type as 'way' | 'relation', entity.id);
    const boundary = segments ? makeBoundary(entity, name, segments, coordinates) : null;
    if (boundary && (!options.keepBoundary || options.keepBoundary(boundary))) boundaries.push(boundary);
    else if (boundary) continue;
    else rejected.push({ osmType: entity.type, osmId: entity.id, name });
  }
  boundaries.sort((a, b) => a.osmType.localeCompare(b.osmType) || a.osmId - b.osmId);
  return { sourceHash, boundaries, rejected, summary: {
    scanned, candidates: candidates.length, accepted: boundaries.length, rejected: rejected.length, neededNodes: neededNodes.size,
  } };
}

export async function preparePolandLocalities(file: string, progress?: (message: string) => void) {
  const result = await preparePbfAreas(file, localityName, progress);
  if (!result.summary.candidates) throw new Error('OSM_LOCALITIES_NOT_FOUND');
  if (!result.boundaries.length) throw new Error('OSM_LOCALITIES_NO_VALID_GEOMETRY');
  return result;
}
