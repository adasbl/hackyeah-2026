import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { classifyPolandSports, normalizePolandPlace, polandExclusionReason, POLAND_IMPORT_CATEGORIES } from '../../src/db/osm-poland';
import { preparePolandPbf } from '../../src/db/osm-pbf';

// Mały rzeczywisty plik protobuf/PBF, niezależny od implementacji parsera.
function varint(value: number): Buffer {
  const bytes: number[] = [];
  do { const byte = value % 128; value = Math.floor(value / 128); bytes.push(byte + (value ? 128 : 0)); } while (value);
  return Buffer.from(bytes);
}
const zigzag = (value: number) => varint(value < 0 ? -value * 2 - 1 : value * 2);
const numeric = (tag: number, value: number) => Buffer.concat([varint(tag * 8), varint(value)]);
const signed = (tag: number, value: number) => Buffer.concat([varint(tag * 8), zigzag(value)]);
const field = (tag: number, value: Buffer) => Buffer.concat([varint(tag * 8 + 2), varint(value.length), value]);
const packed = (tag: number, values: number[], signedValues = false) => field(tag, Buffer.concat(values.map(signedValues ? zigzag : varint)));
function block(type: string, data: Buffer) {
  const blob = Buffer.concat([numeric(2, data.length), field(3, deflateSync(data))]);
  const header = Buffer.concat([field(1, Buffer.from(type)), numeric(3, blob.length)]);
  const length = Buffer.alloc(4); length.writeUInt32BE(header.length);
  return Buffer.concat([length, header, blob]);
}
function fixture() {
  const strings = [''];
  const index = (value: string) => { if (!strings.includes(value)) strings.push(value); return strings.indexOf(value); };
  const tags = (value: Record<string, string>) => Buffer.concat([
    packed(2, Object.keys(value).map(index)), packed(3, Object.values(value).map(index)),
  ]);
  const node = (id: number, value: Record<string, string> = {}, x = 21, y = 52) => field(1, Buffer.concat([
    signed(1, id), tags(value), signed(8, Math.round(y * 1e7)), signed(9, Math.round(x * 1e7)),
    // Info bez visible/autorów, spotykane w publicznych snapshotach.
    field(4, numeric(1, 2)),
  ]));
  const way = (id: number, refs: number[], value: Record<string, string> = {}) => field(3, Buffer.concat([
    numeric(1, id), tags(value), packed(8, refs.map((ref, i) => ref - (refs[i - 1] ?? 0)), true),
  ]));
  const relation = (id: number, memberId: number, memberType: number, value: Record<string, string> = {}) => field(4, Buffer.concat([
    numeric(1, id), tags(value), packed(8, [index('outer')]), packed(9, [memberId], true), packed(10, [memberType]),
  ]));
  const nodes = Buffer.concat([
    node(1, { leisure: 'fitness_centre', name: 'Siłownia Test', 'addr:city': 'Łódź' }),
    node(2, { leisure: 'swimming_pool', name: 'Pływalnia' }),
    node(3, { leisure: 'fitness_centre', sport: 'fitness' }),
    node(4, { leisure: 'sports_hall', sport: 'climbing' }),
    node(5, { amenity: 'dancing_school' }),
    node(6, { leisure: 'fitness_centre', indoor: 'no', fee: 'no' }),
    node(7, { sport: 'climbing', natural: 'cliff' }),
    node(8, { leisure: 'fitness_station', sport: 'fitness' }),
    node(10, {}, 21, 52), node(11, {}, 21.02, 52.04),
  ]);
  const ways = Buffer.concat([
    way(20, [10, 11], { leisure: 'pitch', sport: 'tennis', name: 'Kort' }),
    way(21, [10, 999], { leisure: 'pitch', sport: 'tennis', name: 'Uszkodzony kort' }),
    way(22, [10, 11]),
  ]);
  const relations = Buffer.concat([
    relation(30, 22, 1),
    relation(31, 30, 2, { leisure: 'sports_centre', sport: 'padel;squash', name: 'Padel' }),
    relation(32, 32, 2, { leisure: 'sports_centre', sport: 'padel', name: 'Cykl' }),
  ]);
  const table = field(1, Buffer.concat(strings.map((value) => field(1, Buffer.from(value)))));
  const primitives = Buffer.concat([table, field(2, nodes), field(2, ways), field(2, relations)]);
  return Buffer.concat([block('OSMHeader', field(4, Buffer.from('OsmSchema-V0.6'))), block('OSMData', primitives)]);
}

test('mapowanie siedmiu grup, semikolonów i padla zachowuje kategorię główną', () => {
  assert.deepEqual(classifyPolandSports({ leisure: 'sports_centre', sport: 'fitness;weightlifting' }), ['silownia', 'fitness']);
  assert.deepEqual(classifyPolandSports({ leisure: 'pitch', sport: 'padel;squash' }), ['squash']);
  assert.deepEqual(classifyPolandSports({ sport: 'dancing' }), ['taniec']);
  assert.deepEqual(classifyPolandSports({ leisure: 'sports_centre', sport: 'swimming' }), ['basen']);
  assert.deepEqual(classifyPolandSports({ natural: 'cliff', sport: 'climbing' }), []);
  assert.equal(polandExclusionReason({ leisure: 'fitness_centre', outdoor: 'yes', fee: 'no' }), 'free_outdoor');
  assert.equal(polandExclusionReason({ leisure: 'swimming_pool', access: 'private' }), 'restricted_access');
});

test('normalizacja nie przypisuje Warszawy ani fikcyjnych kart i cen', () => {
  const row = normalizePolandPlace({ type: 'node', id: 1, tags: {
    name: 'Klub', 'addr:city': 'Łódź', website: 'javascript:alert(1)', opening_hours: '24/7',
  } }, { x: 19.4, y: 51.7 }, 'tenis');
  assert.equal(row.citySlug, 'lodz'); assert.equal(row.city, 'Łódź');
  assert.equal(row.website, null); assert.equal(row.isPublished, false);
  assert.deepEqual(row.prices, []);
  assert.equal(normalizePolandPlace({ type: 'node', id: 2 }, { x: 21, y: 52 }, 'fitness').city, null);
});

test('PBF: pełne kategorie, obrysy, zagnieżdżone relacje, braki geometrii i uszkodzony plik', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'osm-poland-test-'));
  try {
    const file = join(directory, 'sports.osm.pbf');
    const bytes = fixture(); await writeFile(file, bytes);
    const result = await preparePolandPbf(file);
    assert.equal(result.sourceHash, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(result.records.length, 7);
    assert.deepEqual(new Set(result.records.map((row) => row.category)), new Set(POLAND_IMPORT_CATEGORIES));
    assert.equal(result.summary.excluded.free_outdoor, 1);
    assert.equal(result.summary.excluded.incomplete_geometry, 2);
    const court = result.records.find((row) => row.slug === 'osm-way-20')!;
    assert.ok(Math.abs(court.location.x - 21.01) < 1e-9);
    assert.ok(Math.abs(court.location.y - 52.02) < 1e-9);
    assert.deepEqual(result.records.find((row) => row.slug === 'osm-relation-31')!.location, court.location);
    assert.equal(result.records.find((row) => row.slug === 'osm-node-1')!.citySlug, 'lodz');
    assert.equal(result.records.find((row) => row.slug === 'osm-node-2')!.city, null);
    const dance = await preparePolandPbf(file, { categories: ['taniec'] });
    assert.deepEqual(dance.records.map((row) => row.category), ['taniec']);
    // Uruchomienie faktycznego CLI w izolowanym katalogu: przygotowanie i odczyt cache bez bazy.
    const root = process.cwd();
    const cli = [join(root, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', join(root, 'tsconfig.json'),
      join(root, 'src/db/import-osm-poland.ts')];
    const execute = promisify(execFile);
    await execute(process.execPath, [...cli, '--file', file, '--prepare-only'], { cwd: directory });
    const cache = join(directory, '.local/osm/polska-sport.json');
    const snapshot = JSON.parse(await readFile(cache, 'utf8'));
    assert.equal(snapshot.records.length, 7);
    assert.equal(snapshot.source.sha256, result.sourceHash);
    await execute(process.execPath, [...cli, '--from-cache'], { cwd: directory });
    snapshot.records[0].name = 'Zmodyfikowany cache';
    await writeFile(cache, JSON.stringify(snapshot));
    await assert.rejects(execute(process.execPath, [...cli, '--from-cache'], { cwd: directory }),
      (error: unknown) => error instanceof Error && error.message.includes('OSM_POLAND_CACHE_INTEGRITY_ERROR'));
    const truncated = join(directory, 'broken.osm.pbf');
    await writeFile(truncated, bytes.subarray(0, bytes.length - 1));
    await assert.rejects(preparePolandPbf(truncated));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
