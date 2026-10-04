import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createLocalityLookup, localityName, makeBoundary, planCityUpdates, stitchRings } from '../../src/db/osm-localities';
import { preparePolandLocalities } from '../../src/db/osm-localities-pbf';
import type { PbfEntity, Point } from '../../src/db/osm-poland';

const square = (x: number, y: number, size: number): Point[] => [
  { x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }, { x, y },
];
function boundary(name = 'Łódź', x = 19, y = 51) {
  const ring = square(x, y, 2), coordinates = new Map(ring.map((point, i) => [i, point]));
  return makeBoundary({ type: 'relation', id: 1 }, name, { outer: [[0, 1, 2, 3, 0]], inner: [] }, coordinates)!;
}

test('granice miejscowości: bez gmin, dzielnic, punktów i pustych nazw', () => {
  const entity: PbfEntity = { type: 'relation', id: 1, tags: { boundary: 'administrative', admin_level: '8', name: 'Łódź' } };
  assert.equal(localityName(entity), 'Łódź');
  assert.equal(localityName({ ...entity, type: 'node' }), null);
  for (const level of ['7', '9', '10']) assert.equal(localityName({ ...entity, tags: { ...entity.tags, admin_level: level } }), null);
  assert.equal(localityName({ ...entity, tags: { ...entity.tags, name: '  ' } }), null);
});

test('łączenie odwróconych odcinków i odrzucanie otwartych, rozwidlonych pierścieni', () => {
  assert.deepEqual(stitchRings([[1, 2], [1, 4], [3, 4], [2, 3]]), [[1, 2, 3, 4, 1]]);
  assert.equal(stitchRings([[1, 2, 3]]), null);
  assert.equal(stitchRings([[1, 2], [2, 3], [3, 1], [1, 4]]), null);
  assert.equal(stitchRings([[1, 2, 1]]), null);
  assert.deepEqual(stitchRings([]), []);
});

test('punkt w rzeczywistym poligonie: dziury, wyspy, krawędzie, nakładanie i brak zgadywania najbliższego miasta', () => {
  const city = boundary();
  city.inner = [square(19.5, 51.5, 0.5)];
  city.outer.push(square(22, 51, 1)); city.bounds[2] = 23;
  const lookup = createLocalityLookup([city]);
  assert.equal(lookup({ x: 19.2, y: 51.2 }).reason, 'matched');
  assert.equal(lookup({ x: 19.75, y: 51.75 }).reason, 'outside_boundaries');
  assert.equal(lookup({ x: 22.5, y: 51.5 }).reason, 'matched');
  assert.equal(lookup({ x: 21.5, y: 51.5 }).reason, 'outside_boundaries');
  assert.equal(lookup({ x: 19, y: 51.5 }).reason, 'on_boundary');
  assert.equal(lookup({ x: 19.5, y: 51.75 }).reason, 'on_boundary');
  assert.equal(lookup({ x: NaN, y: 51 }).reason, 'invalid_location');
  assert.equal(createLocalityLookup([boundary(), boundary('Inne miasto')])({ x: 20, y: 52 }).reason, 'ambiguous');
  assert.equal(createLocalityLookup([boundary(), boundary()])({ x: 20, y: 52 }).reason, 'matched');
  // Punkt w bbox, lecz poza trójkątem, nie może dostać miasta.
  const triangle = boundary(); triangle.outer = [[{ x: 19, y: 51 }, { x: 21, y: 51 }, { x: 19, y: 53 }, { x: 19, y: 51 }]];
  assert.equal(createLocalityLookup([triangle])({ x: 20.8, y: 52.8 }).reason, 'outside_boundaries');
});

test('plan chroni istniejące miasta i slugi; ponowienie jest idempotentne', () => {
  const lookup = createLocalityLookup([boundary()]);
  const row = { id: '1', slug: 'osm-node-1', city: null, citySlug: null, location: { x: 20, y: 52 } };
  const plan = planCityUpdates([row,
    { ...row, id: '2', city: 'Warszawa', citySlug: 'warszawa' },
    { ...row, id: '3', city: 'Gdańsk' },
    { ...row, id: '4', citySlug: 'reczna-poprawka' },
    { ...row, id: '5', location: { x: 10, y: 50 } },
  ], lookup);
  assert.deepEqual(plan.updates.map((u) => [u.before.id, u.city, u.citySlug]), [['1', 'Łódź', 'lodz'], ['3', 'Gdańsk', 'gdansk']]);
  assert.deepEqual(plan.skipped, { already_complete: 1, existing_slug_without_city: 1, outside_boundaries: 1 });
  assert.deepEqual(plan.unresolved.map((row) => row.id), ['4', '5']);
  assert.equal(planCityUpdates(plan.updates.map((u) => ({ ...u.before, city: u.city, citySlug: u.citySlug })), lookup).updates.length, 0);
});

function fixture() {
  const vi = (value: number): Buffer => {
    const bytes = []; do { const byte = value % 128; value = Math.floor(value / 128); bytes.push(byte + (value ? 128 : 0)); } while (value);
    return Buffer.from(bytes);
  };
  const zz = (n: number) => vi(n < 0 ? -n * 2 - 1 : n * 2);
  const numeric = (tag: number, value: number) => Buffer.concat([vi(tag * 8), vi(value)]);
  const field = (tag: number, value: Buffer) => Buffer.concat([vi(tag * 8 + 2), vi(value.length), value]);
  const signed = (tag: number, value: number) => Buffer.concat([vi(tag * 8), zz(value)]);
  const packed = (tag: number, values: number[], signedValues = false) => field(tag, Buffer.concat(values.map(signedValues ? zz : vi)));
  const strings = [''];
  const index = (value: string) => { if (!strings.includes(value)) strings.push(value); return strings.indexOf(value); };
  const tags = (value: Record<string, string>) => Buffer.concat([packed(2, Object.keys(value).map(index)), packed(3, Object.values(value).map(index))]);
  const node = (id: number, x: number, y: number) => field(1, Buffer.concat([
    signed(1, id), signed(8, Math.round(y * 1e7)), signed(9, Math.round(x * 1e7)),
  ]));
  const way = (id: number, refs: number[], value: Record<string, string> = {}) => field(3, Buffer.concat([
    numeric(1, id), tags(value), packed(8, refs.map((ref, i) => ref - (refs[i - 1] ?? 0)), true),
  ]));
  const relation = (id: number, members: [number, number, string][], value: Record<string, string> = {}) => field(4, Buffer.concat([
    numeric(1, id), tags(value), packed(8, members.map((m) => index(m[2]))),
    packed(9, members.map((m, i) => m[0] - (members[i - 1]?.[0] ?? 0)), true), packed(10, members.map((m) => m[1])),
  ]));
  const boundaryTags = { boundary: 'administrative', admin_level: '8', name: 'Łódź', type: 'boundary' };
  const nodes = Buffer.concat([node(1, 19, 51), node(2, 21, 51), node(3, 21, 53), node(4, 19, 53),
    node(5, 19.5, 51.5), node(6, 20, 51.5), node(7, 20, 52), node(8, 19.5, 52)]);
  const ways = Buffer.concat([way(20, [1, 2]), way(21, [3, 2]), way(22, [3, 4, 1]), way(23, [5, 6, 7, 8, 5]),
    way(24, [1, 2, 3, 4, 1], { ...boundaryTags, admin_level: '7' }), way(25, [1, 999, 3, 1])]);
  const relations = Buffer.concat([
    relation(30, [[20, 1, 'outer'], [22, 1, 'outer'], [21, 1, 'outer'], [23, 1, 'inner'], [999, 0, 'label']]),
    relation(31, [[30, 2, 'outer']], boundaryTags),
    relation(32, [[25, 1, 'outer']], { ...boundaryTags, name: 'Uszkodzona' }),
    relation(33, [[33, 2, 'outer']], { ...boundaryTags, name: 'Cykl' }),
  ]);
  const block = (type: string, bytes: Buffer) => {
    const blob = Buffer.concat([numeric(2, bytes.length), field(3, deflateSync(bytes))]);
    const header = Buffer.concat([field(1, Buffer.from(type)), numeric(3, blob.length)]);
    const length = Buffer.alloc(4); length.writeUInt32BE(header.length); return Buffer.concat([length, header, blob]);
  };
  const table = field(1, Buffer.concat(strings.map((value) => field(1, Buffer.from(value)))));
  return Buffer.concat([block('OSMHeader', field(4, Buffer.from('OsmSchema-V0.6'))),
    block('OSMData', Buffer.concat([table, field(2, nodes), field(2, ways), field(2, relations)]))]);
}

test('PBF i CLI: zagnieżdżone granice, pomijanie label, niepełnej geometrii i cykli; cache bez bazy', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'osm-localities-test-'));
  try {
    const bytes = fixture(), file = join(directory, 'localities.osm.pbf'); await writeFile(file, bytes);
    const result = await preparePolandLocalities(file);
    assert.equal(result.sourceHash, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(result.boundaries.length, 1); assert.equal(result.rejected.length, 2);
    const lookup = createLocalityLookup(result.boundaries);
    assert.equal(lookup({ x: 19.2, y: 51.2 }).reason, 'matched');
    assert.equal(lookup({ x: 19.75, y: 51.75 }).reason, 'outside_boundaries');
    const root = process.cwd(), execute = promisify(execFile);
    const cli = [join(root, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', join(root, 'tsconfig.json'), join(root, 'src/db/fill-osm-cities.ts')];
    await execute(process.execPath, [...cli, '--file', file, '--prepare-only'], { cwd: directory });
    const cache = join(directory, '.local/osm/cities/polska-localities.json');
    const snapshot = JSON.parse(await readFile(cache, 'utf8'));
    assert.equal(snapshot.boundaries.length, 1); assert.equal(snapshot.source.sha256, result.sourceHash);
    // Poprawny cache przechodzi walidację, ale brak konfiguracji blokuje dostęp do bazy.
    const offline = { cwd: directory, env: { ...process.env, DATABASE_MIGRATION_URL: '' } };
    await assert.rejects(execute(process.execPath, [...cli, '--from-cache'], offline),
      (error: unknown) => error instanceof Error && error.message.includes('DATABASE_MIGRATION_URL_MISSING'));
    await assert.rejects(execute(process.execPath, [...cli, '--from-cache', '--apply', '--dry-run'], offline),
      (error: unknown) => error instanceof Error && error.message.includes('OSM_CITIES_INVALID_ARGUMENT'));
    snapshot.boundaries[0].name = 'Zmiana bez aktualizacji hasha'; await writeFile(cache, JSON.stringify(snapshot));
    await assert.rejects(execute(process.execPath, [...cli, '--from-cache'], { cwd: directory }),
      (error: unknown) => error instanceof Error && error.message.includes('OSM_CITIES_CACHE_INTEGRITY_ERROR'));
    snapshot.boundaries[0].name = 'Łódź';
    snapshot.boundaries[0].bounds = [-180, -90, 180, 90];
    snapshot.boundaryHash = createHash('sha256').update(JSON.stringify(snapshot.boundaries)).digest('hex');
    await writeFile(cache, JSON.stringify(snapshot));
    await assert.rejects(execute(process.execPath, [...cli, '--from-cache'], offline),
      (error: unknown) => error instanceof Error && error.message.includes('OSM_CITIES_FAILED'));
    const truncated = join(directory, 'broken.osm.pbf'); await writeFile(truncated, bytes.subarray(0, -1));
    await assert.rejects(preparePolandLocalities(truncated));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
