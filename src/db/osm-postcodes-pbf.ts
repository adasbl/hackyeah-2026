import { preparePbfAreas } from './osm-localities-pbf';
import { makeBoundary, pointInBoundary, type Bounds } from './osm-localities';
import { scanPbf } from './osm-pbf';
import { createReadStream, openSync, closeSync, writeSync } from 'node:fs';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validPoint } from './osm-poland';
import { createTargetIndex, distanceMeters, normalizePolishPostcode, postcodeArea,
  type PostcodeTarget, type PostcodeAddress, type PostcodeArea } from './osm-postcodes';

export async function preparePolandPostcodes(file: string, targets: PostcodeTarget[], progress?: (message: string) => void) {
  const targetIndex = createTargetIndex(targets);
  const metadata = new Map<string, NonNullable<ReturnType<typeof postcodeArea>>>();
  const addresses: PostcodeAddress[] = [];
  // Miliony budynków: odcinki trafiają na dysk, ID i współrzędne do tablic numerycznych.
  // Nie tworzymy wielomilionowych Map/Set ani nie przechowujemy tagów wszystkich adresów.
  const directory = await mkdtemp(join(tmpdir(), 'osm-postcodes-'));
  const spool = join(directory, 'address-areas.jsonl');
  let descriptor: number | null = openSync(spool, 'wx');
  const chunks: Float64Array[] = [];
  let chunk = new Float64Array(262_144), used = 0, vertices = 0, addressAreaCandidates = 0;
  let lines: string[] = [], lineBytes = 0;
  const flush = () => {
    if (lines.length) {
      const bytes = Buffer.from(lines.join(''));
      let offset = 0;
      while (offset < bytes.length) {
        const written = writeSync(descriptor!, bytes, offset, bytes.length - offset);
        if (!written) throw new Error('OSM_POSTCODES_SPOOL_WRITE_FAILED');
        offset += written;
      }
    }
    lines = []; lineBytes = 0;
  };
  const addId = (id: number) => {
    if (used === chunk.length) { chunks.push(chunk); chunk = new Float64Array(262_144); used = 0; }
    chunk[used++] = id; vertices++;
  };
  try {
    const prepared = await preparePbfAreas(file, (entity) => {
      const area = postcodeArea(entity); if (!area) return null;
      if (entity.type === 'way' && area.kind === 'address_area') return null;
      metadata.set(`${entity.type}/${entity.id}`, area); return area.postcode;
    }, progress, {
      onEntity(entity) {
        if (entity.type === 'way') {
          const area = postcodeArea(entity);
          if (area?.kind === 'address_area') {
            const line = `${JSON.stringify({ id: entity.id, postcode: area.postcode, refs: entity.refs })}\n`;
            lines.push(line); lineBytes += line.length;
            if (lineBytes >= 1_048_576) flush();
            for (const ref of entity.refs!) addId(ref);
            if (++addressAreaCandidates % 250_000 === 0) progress?.(`Zapisano ${addressAreaCandidates} obszarów adresowych na dysk`);
          }
          return;
        }
        const tags = entity.tags;
        if (entity.type !== 'node' || !tags?.['addr:postcode'] || !tags['addr:street']?.trim() || !tags['addr:housenumber']?.trim()
          || (tags['addr:country'] && tags['addr:country'].toUpperCase() !== 'PL')) return;
        const postcode = normalizePolishPostcode(tags['addr:postcode']), point = { x: entity.lon!, y: entity.lat! };
        if (!postcode || !validPoint(point)) return;
        // 0,003 stopnia obejmuje promień 150 m na terenie Polski; odległość jest dodatkowo mierzona.
        const nearby = targetIndex([point.x - 0.003, point.y - 0.003, point.x + 0.003, point.y + 0.003]);
        if (!nearby.some((target) => distanceMeters(point, target.location) <= 150)) return;
        addresses.push({ osmType: 'node', osmId: entity.id, postcode, location: point,
          street: tags['addr:street'].trim(), houseNumber: tags['addr:housenumber'].trim(),
          city: tags['addr:city']?.trim() || tags['addr:town']?.trim() || tags['addr:village']?.trim() || null });
      },
      keepBoundary(boundary) {
        return targetIndex(boundary.bounds).some((target) => pointInBoundary(target.location, boundary) !== 'outside');
      },
    });
    flush(); closeSync(descriptor); descriptor = null;
    const areas: PostcodeArea[] = prepared.boundaries.map((geometry) => ({ ...metadata.get(`${geometry.osmType}/${geometry.osmId}`)!, geometry }));
    const ids = new Float64Array(vertices);
    let offset = 0;
    for (const part of chunks) { ids.set(part, offset); offset += part.length; }
    ids.set(chunk.subarray(0, used), offset); chunks.length = 0; chunk = new Float64Array(0);
    ids.sort();
    let unique = 0;
    for (let i = 0; i < ids.length; i++) if (i === 0 || ids[i] !== ids[i - 1]) ids[unique++] = ids[i];
    const xs = new Float64Array(unique), ys = new Float64Array(unique), present = new Uint8Array(unique);
    const find = (id: number) => {
      let low = 0, high = unique;
      while (low < high) { const middle = (low + high) >>> 1; if (ids[middle] < id) low = middle + 1; else high = middle; }
      return low;
    };
    if (unique) {
      progress?.(`Współrzędne adresów: ${unique} unikalnych węzłów w tablicach numerycznych`);
      let cursor = 0, previous = -Infinity, scanned = 0;
      const passHash = await scanPbf(file, (entity) => {
        if (++scanned % 20_000_000 === 0) progress?.(`Współrzędne adresów: przejrzano ${scanned} elementów`);
        if (entity.type !== 'node') return;
        // Snapshoty są zwykle uporządkowane po ID, ale niesortowany PBF też jest poprawny.
        if (entity.id < previous) cursor = find(entity.id);
        else while (cursor < unique && ids[cursor] < entity.id) cursor++;
        previous = entity.id;
        if (cursor >= unique || ids[cursor] !== entity.id) return;
        const point = { x: entity.lon!, y: entity.lat! };
        if (validPoint(point)) { xs[cursor] = point.x; ys[cursor] = point.y; present[cursor] = 1; }
      }, { withTags: false, withInfo: false });
      if (passHash !== prepared.sourceHash) throw new Error('OSM_PBF_CHANGED_DURING_READ');
    }
    const reader = createInterface({ input: createReadStream(spool), crlfDelay: Infinity });
    let checked = 0;
    for await (const line of reader) {
      const area = JSON.parse(line) as { id: number; postcode: string; refs: number[] };
      const indices: number[] = [];
      const bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
      let complete = true;
      for (const ref of area.refs) {
        const index = find(ref);
        if (index >= unique || ids[index] !== ref || !present[index]) { complete = false; break; }
        indices.push(index);
        bounds[0] = Math.min(bounds[0], xs[index]); bounds[1] = Math.min(bounds[1], ys[index]);
        bounds[2] = Math.max(bounds[2], xs[index]); bounds[3] = Math.max(bounds[3], ys[index]);
      }
      if (!complete) { prepared.rejected.push({ osmType: 'way', osmId: area.id, name: area.postcode }); continue; }
      const nearby = targetIndex(bounds);
      if (nearby.length) {
        const coordinates = new Map(area.refs.map((ref, i) => [ref, { x: xs[indices[i]], y: ys[indices[i]] }]));
        const geometry = makeBoundary({ type: 'way', id: area.id }, area.postcode, { outer: [area.refs], inner: [] }, coordinates);
        if (!geometry) prepared.rejected.push({ osmType: 'way', osmId: area.id, name: area.postcode });
        else if (nearby.some((target) => pointInBoundary(target.location, geometry) !== 'outside')) areas.push({ kind: 'address_area', postcode: area.postcode, geometry });
      }
      if (++checked % 250_000 === 0) progress?.(`Dopasowano geometrię ${checked} obszarów adresowych; istotne obszary: ${areas.length}`);
    }
    return { sourceHash: prepared.sourceHash, targets, areas, addresses, rejected: prepared.rejected,
      summary: { ...prepared.summary, candidates: prepared.summary.candidates + addressAreaCandidates, accepted: areas.length,
        outOfScope: prepared.summary.candidates + addressAreaCandidates - areas.length - prepared.rejected.length,
        rejected: prepared.rejected.length, targets: targets.length, addressNodes: addresses.length,
        areas: areas.length, addressAreaCandidates, addressAreaVertices: unique } };
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    await rm(spool, { force: true }); await rmdir(directory);
  }
}
